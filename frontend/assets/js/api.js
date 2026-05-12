(function () {
  const TOKEN_KEY = 'ix_auth_token';
  const USER_KEY = 'ix_user';
  const ROLE_KEY = 'ix_user_role';

  const roleToClient = {
    SME: 'registrar',
    BUYER: 'payer',
    FUNDER: 'funder',
    ADMIN: 'admin'
  };

  const aliasToServerRole = {
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

  function apiBase() {
    if (window.location.protocol === 'file:') return 'http://localhost:3000';
    return window.location.origin;
  }

  function normalizeRole(role) {
    if (!role) return null;
    const key = String(role).trim().toLowerCase();
    return aliasToServerRole[key] || String(role).trim().toUpperCase();
  }

  function clientRole(role) {
    return roleToClient[normalizeRole(role)] || 'funder';
  }

  function redirectForRole(role) {
    const normalized = normalizeRole(role);
    if (normalized === 'ADMIN') return 'admin-kyb-review.html';
    return `mypage.html?role=${clientRole(normalized)}`;
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(data) {
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    const role = data.role || data.user?.role || data.user?.role_type;
    if (role) localStorage.setItem(ROLE_KEY, clientRole(role));
    localStorage.setItem('ix_logged_in', 'true');
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('ix_logged_in');
  }

  function authHeaders() {
    const headers = {};
    const savedToken = token();
    if (savedToken) headers.Authorization = `Bearer ${savedToken}`;
    return headers;
  }

  async function request(path, options = {}) {
    const headers = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...(options.headers || {})
    };

    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `Request failed: ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async function signup(payload) {
    return request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async function login(payload) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setSession(data);
    return data;
  }

  window.InvoiceXApi = {
    request,
    signup,
    login,
    logout: clearSession,
    token,
    setSession,
    normalizeRole,
    clientRole,
    redirectForRole,
    me: () => request('/api/me'),
    mypage: () => request('/api/mypage'),
    submitKyb: (payload) => request('/api/kyb/verifications', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    }),
    kybMe: () => request('/api/kyb/me'),
    connectWallet: (payload) => request('/api/wallets/connect', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
    wallet: () => request('/api/wallets/me'),
    walletBalance: () => request('/api/wallets/me/balance'),
    adminKybList: () => request('/api/admin/kyb/verifications'),
    adminApproveKyb: (id, payload) => request(`/api/admin/kyb/verifications/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {})
    }),
    adminRejectKyb: (id, payload) => request(`/api/admin/kyb/verifications/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(payload || {})
    })
  };
})();
