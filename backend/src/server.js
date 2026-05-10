require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

//JWT 토큰 검증
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "인증 토큰이 없습니다. 다시 로그인해주세요." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "유효하지 않거나 만료된 토큰입니다." });

        req.user = user;
        next(); // 검사 통과 -> 다음 API로 넘어가기
    });
};

// 1. 회원가입 API (그대로 유지)
app.post('/api/auth/signup', async (req, res) => {
    const { email, password, user_name, role_type, company_name, business_number, company_type } = req.body;

    const { data: company, error: compErr } = await supabase
        .from('companies')
        .insert([{ company_name, business_number, company_type, kyb_status: 'NOT_SUBMITTED' }])
        .select().single();
    if (compErr) return res.status(500).json({ error: "기업 생성 실패", details: compErr });

    const { data: user, error: userErr } = await supabase
        .from('users')
        .insert([{ email, password, user_name, role_type, company_id: company.company_id }])
        .select().single();
    if (userErr) return res.status(500).json({ error: "사용자 생성 실패", details: userErr });

    res.json({ message: "회원가입이 완료되었습니다. 로그인해주세요.", user });
});

// 2. 로그인 API 
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();

    if (!user || user.password !== password) {
        return res.status(401).json({ message: "이메일 또는 비밀번호가 틀렸습니다." });
    }

    const token = jwt.sign(
        { userId: user.user_id, role: user.role_type, companyId: user.company_id },
        process.env.JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ message: "로그인 성공", token });
});


// 3. 이동 페이지 조회 API (토큰 보안 + BUYER 역할 반영)
app.get('/api/me/route', authenticateToken, async (req, res) => {
    // 💡 URL 파라미터가 아니라 해독된 토큰에서 userId를 사용
    const userId = req.user.userId;

    const { data: user, error } = await supabase.from('users').select('role_type').eq('user_id', userId).single();
    if (error || !user) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });

    let targetPage = '/';
    if (user.role_type === 'SME') targetPage = '/mypage/sme';
    else if (user.role_type === 'BUYER') targetPage = '/mypage/buyer';
    else if (user.role_type === 'FUNDER') targetPage = '/mypage/funder';
    else if (user.role_type === 'ADMIN') targetPage = '/admin';

    res.json({ role: user.role_type, redirect_to: targetPage });
});


// 4. 내 마이페이지 정보 조회 API (토큰 보안 적용)

app.get('/api/me/mypage', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    const { data: userInfo, error: userErr } = await supabase
        .from('users')
        .select(`user_name, email, role_type, companies ( company_name, kyb_status, badge_status )`)
        .eq('user_id', userId).single();
    if (userErr) return res.status(500).json({ error: "유저 정보 조회 실패" });

    const { data: wallet } = await supabase
        .from('wallets').select('wallet_address, rlusd_balance').eq('owner_id', userId).single();

    res.json({
        user_name: userInfo.user_name,
        email: userInfo.email,
        role: userInfo.role_type,
        company_name: userInfo.companies?.company_name,
        kyb_status: userInfo.companies?.kyb_status,
        has_badge: userInfo.companies?.badge_status,
        is_wallet_connected: !!wallet,
        wallet_address: wallet ? wallet.wallet_address : null,

        // wallet 데이터가 있으면 DB에서 가져온 실제 잔액 변수를 띄워주고, 없으면 "0.00"을 띄워라
        rlusd_balance: wallet ? wallet.rlusd_balance : "0.00"
    });
});

app.listen(process.env.PORT, () => {
    console.log(`백엔드 서버 구동이 완료되었습니다. 포트: ${process.env.PORT}`);
});