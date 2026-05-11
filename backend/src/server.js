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
        .insert([{ company_name, business_number, company_type, kyb_status: 'NOT_STARTED' }])
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
        rlusd_balance: wallet ? wallet.rlusd_balance : "0.00"
    });
});

app.listen(process.env.PORT, () => {
    console.log(`백엔드 서버 구동이 완료되었습니다. 포트: ${process.env.PORT}`);
});

// 5. 지갑 연결 API (내 지갑 주소 DB에 저장하기)
app.post('/api/wallet/connect', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { wallet_address } = req.body;

    if (!wallet_address) return res.status(400).json({ message: "지갑 주소를 보내주세요" });

    // 1. 이미 이 유저의 지갑이 DB에 있는지 확인
    const { data: existingWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('owner_id', userId)
        .single();

    let resultData;
    let resultError;

    if (existingWallet) {
        // 2. 이미 지갑이 있으면 주소만 '업데이트'
        const { data, error } = await supabase
            .from('wallets')
            .update({ wallet_address: wallet_address })
            .eq('owner_id', userId)
            .select();
        resultData = data; resultError = error;
    } else {
        // 3. 지갑이 없으면 '새로 생성' (초기 잔액 0원)
        const { data, error } = await supabase
            .from('wallets')
            .insert([{ owner_id: userId, wallet_address: wallet_address, rlusd_balance: 0.00 }])
            .select();
        resultData = data; resultError = error;
    }

    if (resultError) return res.status(500).json({ error: "지갑 연결 실패", details: resultError });
    res.json({ message: "지갑 연결 성공!", wallet: resultData[0] });
});

// 6. KYB 인증 신청 API (상태를 PENDING으로 변경)
app.post('/api/kyb/submit', authenticateToken, async (req, res) => {
    const companyId = req.user.companyId;

    if (!companyId) return res.status(400).json({ message: "소속된 기업 정보가 없습니다." });

    // companies 테이블의 kyb_status를 'PENDING'으로 업데이트
    const { data: company, error } = await supabase
        .from('companies')
        .update({ kyb_status: 'PENDING' })
        .eq('company_id', companyId)
        .select().single();

    if (error) return res.status(500).json({ error: "KYB 신청 실패", details: error });
    res.json({ message: "KYB 인증 신청이 완료되었습니다. 관리자 검토를 기다려주세요.", company });
});

// 7. 관리자 KYB 검토 API (ADMIN 전용)
app.post('/api/admin/kyb/review', authenticateToken, async (req, res) => {
    const role = req.user.role; // 토큰에서 내 역할 꺼내기
    const { target_company_id, action } = req.body; // action은 'APPROVED' 또는 'REJECTED'

    // 관리자가 아니면 접근 제한
    if (role !== 'ADMIN') {
        return res.status(403).json({ message: "접근 권한이 없습니다. 오직 관리자만 승인할 수 있습니다." });
    }

    if (action !== 'APPROVED' && action !== 'REJECTED') {
        return res.status(400).json({ message: "action 값은 'APPROVED' 또는 'REJECTED'여야 합니다." });
    }

    // 승인(APPROVED)이면 인증 뱃지도 true, 거절이면 false
    const badgeStatus = (action === 'APPROVED');

    // 해당 기업의 상태 업데이트
    const { data: company, error } = await supabase
        .from('companies')
        .update({ kyb_status: action, badge_status: badgeStatus })
        .eq('company_id', target_company_id)
        .select().single();

    if (error) return res.status(500).json({ error: "KYB 검토 처리 실패", details: error });
    res.json({ message: `기업 KYB 상태가 ${action}로 변경되었습니다!`, company });
});