const crypto = require('crypto');
const path = require('path');
const { promisify } = require('util');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const xrpl = require('xrpl');

require('dotenv').config({
    path: path.resolve(__dirname, '..', '.env'),
    quiet: true
});

const scryptAsync = promisify(crypto.scrypt);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XRPL_TESTNET_URL = process.env.XRPL_TESTNET_URL || 'wss://s.altnet.rippletest.net:51233';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[config] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for database access.');
}

if (!JWT_SECRET) {
    console.warn('[config] JWT_SECRET is required for authenticated API access.');
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    })
    : null;

function getSupabase() {
    if (!supabase) {
        const error = new Error('Supabase server configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        error.statusCode = 503;
        throw error;
    }

    return supabase;
}

const repoRoot = path.resolve(__dirname, '..', '..');
const pagesDir = path.join(repoRoot, 'frontend', 'pages');
const assetsDir = path.join(repoRoot, 'frontend', 'assets');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/assets', express.static(assetsDir));
app.use(express.static(pagesDir));

app.get('/', (_req, res) => {
    res.sendFile(path.join(pagesDir, 'start.html'));
});

const ROLE_ALIASES = {
    invoice: 'SME',
    registrar: 'SME',
    sme: 'SME',
    rwa: 'FUNDER',
    funder: 'FUNDER',
    payment: 'BUYER',
    payer: 'BUYER',
    buyer: 'BUYER',
    admin: 'ADMIN',
    verifier: 'ADMIN'
};

const CLIENT_ROLE_BY_SERVER_ROLE = {
    SME: 'registrar',
    BUYER: 'payer',
    FUNDER: 'funder',
    ADMIN: 'admin'
};

const REDIRECT_BY_ROLE = {
    SME: '/mypage.html?role=registrar',
    BUYER: '/mypage.html?role=payer',
    FUNDER: '/mypage.html?role=funder',
    ADMIN: '/admin-kyb-review.html'
};

const PUBLIC_SIGNUP_ROLES = new Set(['SME', 'BUYER', 'FUNDER']);

function normalizeRole(role) {
    if (!role) return null;
    return ROLE_ALIASES[String(role).trim().toLowerCase()] || String(role).trim().toUpperCase();
}

function clientRole(role) {
    return CLIENT_ROLE_BY_SERVER_ROLE[normalizeRole(role)] || 'funder';
}

function redirectForRole(role) {
    return REDIRECT_BY_ROLE[normalizeRole(role)] || '/mypage.html?role=funder';
}

function publicUser(user) {
    if (!user) return null;
    return {
        user_id: user.user_id,
        email: user.email,
        user_name: user.user_name,
        role_type: normalizeRole(user.role_type),
        role: normalizeRole(user.role_type),
        client_role: clientRole(user.role_type),
        company_id: user.company_id || user.companies?.company_id || null
    };
}

function dbError(res, message, error, status = 500) {
    console.error(message, error);
    const details = error?.message || error?.details || error;
    return res.status(error?.statusCode || status).json({ message, error: message, details });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = await scryptAsync(password, salt, 64);
    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedPassword) {
    if (!storedPassword) return false;

    if (!storedPassword.startsWith('scrypt:')) {
        return password === storedPassword;
    }

    const [, salt, key] = storedPassword.split(':');
    if (!salt || !key) return false;

    const derivedKey = await scryptAsync(password, salt, 64);
    const storedKey = Buffer.from(key, 'hex');
    if (storedKey.length !== derivedKey.length) return false;

    return crypto.timingSafeEqual(storedKey, derivedKey);
}

function signToken(user) {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured.');
    }

    return jwt.sign(
        {
            userId: user.user_id,
            role: normalizeRole(user.role_type),
            companyId: user.company_id || null
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: 'Authentication token is required.' });
    }

    if (!JWT_SECRET) {
        return res.status(500).json({ message: 'JWT_SECRET is not configured.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Authentication token is invalid or expired.' });
        }

        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (normalizeRole(req.user?.role) !== 'ADMIN') {
        return res.status(403).json({ message: 'Admin permission is required.' });
    }
    next();
}

async function getCurrentUser(userId) {
    const { data, error } = await getSupabase()
        .from('users')
        .select(`
            user_id,
            email,
            user_name,
            role_type,
            company_id,
            companies (
                company_id,
                company_name,
                business_number,
                company_type,
                kyb_status,
                badge_status
            )
        `)
        .eq('user_id', userId)
        .single();

    if (error) throw error;
    return data;
}

async function getUserWallet(userId) {
    const { data, error } = await getSupabase()
        .from('wallets')
        .select('*')
        .eq('owner_type', 'USER')
        .eq('owner_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
}

function shapeMyPage(user, wallet) {
    const company = user.companies || {};
    const kybStatus = company.kyb_status || 'NOT_SUBMITTED';
    const hasBadge = Boolean(company.badge_status) || kybStatus === 'APPROVED';

    return {
        user: publicUser(user),
        user_name: user.user_name,
        email: user.email,
        role: normalizeRole(user.role_type),
        client_role: clientRole(user.role_type),
        company_id: company.company_id || user.company_id || null,
        company_name: company.company_name || null,
        kyb_status: kybStatus,
        has_badge: hasBadge,
        kyb_badge: hasBadge,
        is_wallet_connected: Boolean(wallet),
        wallet_address: wallet?.wallet_address || null,
        wallet_type: wallet?.credential_status || null,
        wallet_network: wallet?.network || null,
        rlusd_balance: wallet?.rlusd_balance ?? '0.00',
        balance_source: 'DEMO_DB'
    };
}

function demoBusinessNumber(role) {
    return `DEMO-${normalizeRole(role) || 'USER'}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function parsePositiveXrp(value, fallback = '1') {
    const raw = value === undefined || value === null || value === '' ? fallback : value;
    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount <= 0) {
        const error = new Error('A positive XRP amount is required.');
        error.statusCode = 400;
        throw error;
    }

    if (amount > 1000) {
        const error = new Error('Demo Testnet payments are limited to 1000 XRP.');
        error.statusCode = 400;
        throw error;
    }

    return String(amount);
}

function hexMemo(value) {
    return Buffer.from(String(value || '').slice(0, 256), 'utf8').toString('hex').toUpperCase();
}

async function withXrplClient(callback) {
    const client = new xrpl.Client(XRPL_TESTNET_URL);
    await client.connect();

    try {
        return await callback(client);
    } finally {
        await client.disconnect();
    }
}

function publicTestnetWallet(wallet, balance) {
    return {
        address: wallet.classicAddress || wallet.address,
        seed: wallet.seed,
        network: 'XRPL_TESTNET',
        balance_xrp: balance
    };
}

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'InvoiceX backend' });
});

app.post('/api/xrpl/testnet/wallet', authenticateToken, async (req, res) => {
    try {
        const amount = parsePositiveXrp(req.body.amount_xrp, '100');
        const result = await withXrplClient((client) => client.fundWallet(null, {
            amount,
            usageContext: 'InvoiceX demo testnet wallet'
        }));

        return res.status(201).json({
            message: 'XRPL Testnet wallet funded.',
            wallet: publicTestnetWallet(result.wallet, result.balance),
            balance_xrp: result.balance,
            faucet: 'XRPL Testnet'
        });
    } catch (error) {
        return dbError(res, 'Failed to create XRPL Testnet wallet.', error);
    }
});

app.post('/api/xrpl/testnet/wallet/fund', authenticateToken, async (req, res) => {
    try {
        const seed = String(req.body.seed || '').trim();
        const amount = parsePositiveXrp(req.body.amount_xrp, '20');

        if (!seed) {
            return res.status(400).json({ message: 'seed is required for demo faucet funding.' });
        }

        const wallet = xrpl.Wallet.fromSeed(seed);
        const result = await withXrplClient((client) => client.fundWallet(wallet, {
            amount,
            usageContext: 'InvoiceX demo testnet faucet refill'
        }));

        return res.json({
            message: 'XRPL Testnet wallet funded.',
            wallet: publicTestnetWallet(result.wallet, result.balance),
            balance_xrp: result.balance,
            faucet: 'XRPL Testnet'
        });
    } catch (error) {
        return dbError(res, 'Failed to fund XRPL Testnet wallet.', error);
    }
});

app.get('/api/xrpl/testnet/accounts/:address/balance', authenticateToken, async (req, res) => {
    try {
        const address = String(req.params.address || '').trim();
        if (!xrpl.isValidClassicAddress(address)) {
            return res.status(400).json({ message: 'A valid XRPL classic address is required.' });
        }

        const balance = await withXrplClient((client) => client.getXrpBalance(address));
        return res.json({
            address,
            balance_xrp: balance,
            network: 'XRPL_TESTNET'
        });
    } catch (error) {
        return dbError(res, 'Failed to load XRPL Testnet balance.', error);
    }
});

app.post('/api/xrpl/testnet/payments', authenticateToken, async (req, res) => {
    try {
        const seed = String(req.body.source_seed || '').trim();
        const destination = String(req.body.destination_address || '').trim();
        const amountXrp = parsePositiveXrp(req.body.amount_xrp, '1');

        if (!seed) {
            return res.status(400).json({ message: 'source_seed is required for demo Testnet payment.' });
        }

        if (!xrpl.isValidClassicAddress(destination)) {
            return res.status(400).json({ message: 'A valid destination_address is required.' });
        }

        const sourceWallet = xrpl.Wallet.fromSeed(seed);
        const tx = {
            TransactionType: 'Payment',
            Account: sourceWallet.classicAddress,
            Destination: destination,
            Amount: xrpl.xrpToDrops(amountXrp)
        };

        if (req.body.memo) {
            tx.Memos = [{ Memo: { MemoData: hexMemo(req.body.memo) } }];
        }

        const result = await withXrplClient((client) => client.submitAndWait(tx, { wallet: sourceWallet }));
        const txResult = result.result.meta?.TransactionResult;

        if (txResult !== 'tesSUCCESS') {
            return res.status(502).json({
                message: 'XRPL Testnet payment was not successful.',
                status: txResult,
                raw: result.result
            });
        }

        return res.json({
            message: 'XRPL Testnet payment succeeded.',
            status: txResult,
            tx_hash: result.result.hash,
            ledger_index: result.result.ledger_index,
            amount_xrp: amountXrp,
            source_address: sourceWallet.classicAddress,
            destination_address: destination,
            network: 'XRPL_TESTNET'
        });
    } catch (error) {
        return dbError(res, 'XRPL Testnet payment failed.', error);
    }
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const userName = String(req.body.user_name || req.body.name || email.split('@')[0] || '').trim();
        const roleType = normalizeRole(req.body.role_type || req.body.role);
        const companyName = String(req.body.company_name || req.body.companyName || '').trim();
        const businessNumber = String(req.body.business_number || '').trim() || demoBusinessNumber(roleType);
        const companyType = String(req.body.company_type || roleType || '').trim() || null;

        if (!email || !password || !roleType || !companyName) {
            return res.status(400).json({ message: 'email, password, role_type, and company_name are required.' });
        }

        if (!PUBLIC_SIGNUP_ROLES.has(roleType)) {
            return res.status(403).json({ message: 'This role cannot be selected during public signup.' });
        }

        const { data: existingUser, error: lookupError } = await getSupabase()
            .from('users')
            .select('user_id')
            .eq('email', email)
            .maybeSingle();

        if (lookupError) return dbError(res, 'Failed to check existing user.', lookupError);
        if (existingUser) return res.status(409).json({ message: 'An account with this email already exists.' });

        const { data: company, error: companyError } = await getSupabase()
            .from('companies')
            .insert([{
                company_name: companyName,
                business_number: businessNumber,
                company_type: companyType,
                kyb_status: 'NOT_SUBMITTED',
                badge_status: false
            }])
            .select()
            .single();

        if (companyError) return dbError(res, 'Failed to create company.', companyError);

        const passwordHash = await hashPassword(password);
        const { data: user, error: userError } = await getSupabase()
            .from('users')
            .insert([{
                email,
                password: passwordHash,
                user_name: userName,
                role_type: roleType,
                company_id: company.company_id
            }])
            .select('user_id,email,user_name,role_type,company_id')
            .single();

        if (userError) {
            return dbError(
                res,
                'Failed to create user. Check that public.users.company_id has been approved and added.',
                userError
            );
        }

        return res.status(201).json({
            message: 'Signup completed.',
            user: publicUser(user),
            company,
            redirect_to: '/login.html'
        });
    } catch (error) {
        return dbError(res, 'Signup failed.', error);
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        if (!email || !password) {
            return res.status(400).json({ message: 'email and password are required.' });
        }

        const { data: user, error } = await getSupabase()
            .from('users')
            .select('user_id,email,password,user_name,role_type,company_id')
            .eq('email', email)
            .maybeSingle();

        if (error) return dbError(res, 'Failed to load user.', error);
        if (!user || !(await verifyPassword(password, user.password))) {
            return res.status(401).json({ message: 'Email or password is incorrect.' });
        }

        if (!String(user.password || '').startsWith('scrypt:')) {
            const passwordHash = await hashPassword(password);
            await getSupabase().from('users').update({ password: passwordHash }).eq('user_id', user.user_id);
        }

        const token = signToken(user);
        return res.json({
            message: 'Login succeeded.',
            token,
            user: publicUser(user),
            role: normalizeRole(user.role_type),
            client_role: clientRole(user.role_type),
            redirect_to: redirectForRole(user.role_type)
        });
    } catch (error) {
        return dbError(res, 'Login failed.', error);
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const user = await getCurrentUser(req.user.userId);
        return res.json({
            user: publicUser(user),
            company: user.companies || null,
            redirect_to: redirectForRole(user.role_type)
        });
    } catch (error) {
        return dbError(res, 'Failed to load current user.', error);
    }
});

app.get('/api/me/route', authenticateToken, async (req, res) => {
    try {
        const user = await getCurrentUser(req.user.userId);
        return res.json({
            role: normalizeRole(user.role_type),
            client_role: clientRole(user.role_type),
            redirect_to: redirectForRole(user.role_type)
        });
    } catch (error) {
        return dbError(res, 'Failed to resolve route.', error);
    }
});

async function myPageHandler(req, res) {
    try {
        const user = await getCurrentUser(req.user.userId);
        const wallet = await getUserWallet(req.user.userId);
        return res.json(shapeMyPage(user, wallet));
    } catch (error) {
        return dbError(res, 'Failed to load my page.', error);
    }
}

app.get('/api/mypage', authenticateToken, myPageHandler);
app.get('/api/me/mypage', authenticateToken, myPageHandler);

async function walletConnectHandler(req, res) {
    try {
        const userId = req.user.userId;
        const walletAddress = String(req.body.wallet_address || req.body.address || '').trim();
        const network = String(req.body.network || 'XRPL').trim();

        if (!walletAddress) {
            return res.status(400).json({ message: 'wallet_address is required.' });
        }

        const existingWallet = await getUserWallet(userId);
        let result;

        if (existingWallet) {
            const { data, error } = await getSupabase()
                .from('wallets')
                .update({
                    wallet_address: walletAddress,
                    network,
                    credential_status: 'CONNECTED'
                })
                .eq('wallet_id', existingWallet.wallet_id)
                .select()
                .single();

            if (error) return dbError(res, 'Failed to update wallet.', error);
            result = data;
        } else {
            const { data, error } = await getSupabase()
                .from('wallets')
                .insert([{
                    owner_type: 'USER',
                    owner_id: userId,
                    wallet_address: walletAddress,
                    network,
                    credential_status: 'CONNECTED',
                    rlusd_balance: 0
                }])
                .select()
                .single();

            if (error) return dbError(res, 'Failed to connect wallet.', error);
            result = data;
        }

        return res.json({
            message: 'Wallet connected.',
            wallet: result,
            balance_source: 'DEMO_DB'
        });
    } catch (error) {
        return dbError(res, 'Wallet connection failed.', error);
    }
}

app.post('/api/wallets/connect', authenticateToken, walletConnectHandler);
app.post('/api/wallet/connect', authenticateToken, walletConnectHandler);

app.get('/api/wallets/me', authenticateToken, async (req, res) => {
    try {
        const wallet = await getUserWallet(req.user.userId);
        return res.json({ wallet, is_wallet_connected: Boolean(wallet) });
    } catch (error) {
        return dbError(res, 'Failed to load wallet.', error);
    }
});

app.get('/api/wallets/me/balance', authenticateToken, async (req, res) => {
    try {
        const wallet = await getUserWallet(req.user.userId);
        return res.json({
            wallet_address: wallet?.wallet_address || null,
            rlusd_balance: wallet?.rlusd_balance ?? '0.00',
            balance_source: 'DEMO_DB'
        });
    } catch (error) {
        return dbError(res, 'Failed to load wallet balance.', error);
    }
});

app.delete('/api/wallets/me', authenticateToken, async (req, res) => {
    try {
        const { error } = await getSupabase()
            .from('wallets')
            .delete()
            .eq('owner_type', 'USER')
            .eq('owner_id', req.user.userId);

        if (error) return dbError(res, 'Failed to disconnect wallet.', error);
        return res.json({ message: 'Wallet disconnected.' });
    } catch (error) {
        return dbError(res, 'Wallet disconnect failed.', error);
    }
});

async function submitKybHandler(req, res) {
    try {
        const companyId = req.user.companyId;
        if (!companyId) return res.status(400).json({ message: 'Company information is missing.' });
        const submittedAt = new Date().toISOString();
        const kybStatus = 'PENDING';

        const metadata = {
            representative_name: req.body.representative_name || req.body.representative || null,
            business_address: req.body.business_address || req.body.address || null,
            business_type: req.body.business_type || req.body.company_type || null,
            contact_email: req.body.contact_email || req.body.email || null,
            document_url: req.body.document_url || null,
            submitted_by: req.user.userId
        };

        const { data: company, error: companyError } = await getSupabase()
            .from('companies')
            .update({
                kyb_status: kybStatus,
                badge_status: false
            })
            .eq('company_id', companyId)
            .select()
            .single();

        if (companyError) return dbError(res, 'Failed to update KYB status.', companyError);

        const { data: verification, error: verificationError } = await getSupabase()
            .from('verifications')
            .insert([{
                target_type: 'COMPANY',
                target_id: companyId,
                verification_type: 'KYB',
                status: kybStatus,
                provider_ref_id: JSON.stringify(metadata),
                submitted_at: submittedAt,
                approved_at: null
            }])
            .select()
            .single();

        if (verificationError) return dbError(res, 'Failed to create KYB verification.', verificationError);

        return res.status(201).json({
            message: 'KYB verification submitted and is waiting for admin approval.',
            demo_auto_approved: false,
            kyb_status: kybStatus,
            has_badge: false,
            company,
            verification
        });
    } catch (error) {
        return dbError(res, 'KYB submission failed.', error);
    }
}

app.post('/api/kyb/verifications', authenticateToken, submitKybHandler);
app.post('/api/kyb/submit', authenticateToken, submitKybHandler);

app.get('/api/kyb/me', authenticateToken, async (req, res) => {
    try {
        const user = await getCurrentUser(req.user.userId);
        const { data: verification, error } = await getSupabase()
            .from('verifications')
            .select('*')
            .eq('target_type', 'COMPANY')
            .eq('target_id', user.company_id)
            .eq('verification_type', 'KYB')
            .order('submitted_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

        if (error) return dbError(res, 'Failed to load KYB verification.', error);
        return res.json({
            company: user.companies || null,
            verification,
            kyb_status: user.companies?.kyb_status || verification?.status || 'NOT_SUBMITTED',
            has_badge: Boolean(user.companies?.badge_status)
        });
    } catch (error) {
        return dbError(res, 'Failed to load KYB status.', error);
    }
});

function parseVerificationMeta(value) {
    if (!value) return {};
    try {
        return JSON.parse(value);
    } catch (_error) {
        return { provider_ref_id: value };
    }
}

async function listKybVerifications() {
    const { data: verifications, error } = await getSupabase()
        .from('verifications')
        .select('*')
        .eq('target_type', 'COMPANY')
        .eq('verification_type', 'KYB')
        .order('submitted_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    const companyIds = [...new Set((verifications || []).map((item) => item.target_id).filter(Boolean))];
    let companiesById = {};

    if (companyIds.length) {
        const { data: companies, error: companyError } = await getSupabase()
            .from('companies')
            .select('*')
            .in('company_id', companyIds);

        if (companyError) throw companyError;
        companiesById = Object.fromEntries((companies || []).map((company) => [company.company_id, company]));
    }

    return (verifications || []).map((verification) => ({
        ...verification,
        meta: parseVerificationMeta(verification.provider_ref_id),
        company: companiesById[verification.target_id] || null
    }));
}

app.get('/api/admin/kyb/verifications', authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const items = await listKybVerifications();
        return res.json({ verifications: items });
    } catch (error) {
        return dbError(res, 'Failed to load KYB verification queue.', error);
    }
});

app.get('/api/admin/kyb/verifications/:verification_id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: verification, error } = await getSupabase()
            .from('verifications')
            .select('*')
            .eq('verification_id', req.params.verification_id)
            .single();

        if (error) return dbError(res, 'Failed to load KYB verification.', error, 404);

        const { data: company, error: companyError } = await getSupabase()
            .from('companies')
            .select('*')
            .eq('company_id', verification.target_id)
            .maybeSingle();

        if (companyError) return dbError(res, 'Failed to load KYB company.', companyError);

        return res.json({
            verification: {
                ...verification,
                meta: parseVerificationMeta(verification.provider_ref_id),
                company
            }
        });
    } catch (error) {
        return dbError(res, 'Failed to load KYB verification.', error);
    }
});

async function decideKyb({ verificationId, adminUserId, action, reason }) {
    const status = action === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    const { data: verification, error: verificationError } = await getSupabase()
        .from('verifications')
        .select('*')
        .eq('verification_id', verificationId)
        .single();

    if (verificationError) throw verificationError;

    const verificationUpdate = {
        status,
        rejected_reason: status === 'REJECTED' ? reason || 'Rejected by admin.' : null,
        approved_at: status === 'APPROVED' ? new Date().toISOString() : null
    };

    const { data: updatedVerification, error: updateVerificationError } = await getSupabase()
        .from('verifications')
        .update(verificationUpdate)
        .eq('verification_id', verificationId)
        .select()
        .single();

    if (updateVerificationError) throw updateVerificationError;

    const { data: company, error: companyError } = await getSupabase()
        .from('companies')
        .update({
            kyb_status: status,
            badge_status: status === 'APPROVED'
        })
        .eq('company_id', verification.target_id)
        .select()
        .single();

    if (companyError) throw companyError;

    await getSupabase().from('admin_reviews').insert([{
        admin_user_id: adminUserId,
        target_type: 'KYB_VERIFICATION',
        target_id: verificationId,
        decision: status
    }]);

    return { verification: updatedVerification, company };
}

app.patch('/api/admin/kyb/verifications/:verification_id/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await decideKyb({
            verificationId: req.params.verification_id,
            adminUserId: req.user.userId,
            action: 'APPROVED',
            reason: req.body.reason
        });
        return res.json({ message: 'KYB approved.', ...result });
    } catch (error) {
        return dbError(res, 'Failed to approve KYB.', error);
    }
});

app.patch('/api/admin/kyb/verifications/:verification_id/reject', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await decideKyb({
            verificationId: req.params.verification_id,
            adminUserId: req.user.userId,
            action: 'REJECTED',
            reason: req.body.reason || req.body.rejected_reason
        });
        return res.json({ message: 'KYB rejected.', ...result });
    } catch (error) {
        return dbError(res, 'Failed to reject KYB.', error);
    }
});

app.post('/api/admin/kyb/review', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const targetCompanyId = req.body.target_company_id;
        const action = normalizeRole(req.body.action) === 'APPROVED' ? 'APPROVED' : String(req.body.action || '').toUpperCase();

        if (!targetCompanyId || !['APPROVED', 'REJECTED'].includes(action)) {
            return res.status(400).json({ message: 'target_company_id and action APPROVED/REJECTED are required.' });
        }

        const { data: verification, error } = await getSupabase()
            .from('verifications')
            .select('*')
            .eq('target_type', 'COMPANY')
            .eq('target_id', targetCompanyId)
            .eq('verification_type', 'KYB')
            .order('submitted_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

        if (error) return dbError(res, 'Failed to load KYB verification.', error);

        if (verification) {
            const result = await decideKyb({
                verificationId: verification.verification_id,
                adminUserId: req.user.userId,
                action,
                reason: req.body.reason
            });
            return res.json({ message: `KYB ${action}.`, ...result });
        }

        const { data: company, error: companyError } = await getSupabase()
            .from('companies')
            .update({ kyb_status: action, badge_status: action === 'APPROVED' })
            .eq('company_id', targetCompanyId)
            .select()
            .single();

        if (companyError) return dbError(res, 'Failed to update company KYB status.', companyError);
        return res.json({ message: `KYB ${action}.`, company });
    } catch (error) {
        return dbError(res, 'Admin KYB review failed.', error);
    }
});

app.listen(PORT, () => {
    console.log(`InvoiceX backend is running on http://localhost:${PORT}`);
});
