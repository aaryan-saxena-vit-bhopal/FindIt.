(function () {
    const BASE = window.FINDIT_API_BASE || '';
    const KEY = 'findit_token';

    function getToken() {
        return localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    }

    function setToken(token, remember) {
        localStorage.removeItem(KEY);
        sessionStorage.removeItem(KEY);
        (remember ? localStorage : sessionStorage).setItem(KEY, token);
    }

    function clearToken() {
        localStorage.removeItem(KEY);
        sessionStorage.removeItem(KEY);
    }

    async function request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers.Authorization = 'Bearer ' + token;

        let res;
        try {
            res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        } catch (e) {
            const err = new Error('Cannot reach the server. Is the backend running?');
            err.status = 0;
            throw err;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            if (res.status === 401 && token) {
                clearToken();
                if (location.pathname !== '/' && !location.pathname.endsWith('/index.html')) location.href = '/index.html';
            }
            const first = data.details ? Object.values(data.details)[0] : null;
            const err = new Error(first || data.error || 'Request failed.');
            err.status = res.status;
            err.code = data.code;
            err.details = data.details;
            throw err;
        }
        return data;
    }

    window.Api = {
        async register(form) {
            return request('POST', '/api/auth/register', form);
        },
        async verifyEmail(email, code) {
            const data = await request('POST', '/api/auth/verify', { email: email, code: code });
            setToken(data.token, false);
            return data.user;
        },
        resendCode(email) {
            return request('POST', '/api/auth/resend', { email: email });
        },
        async login(email, password, remember) {
            const data = await request('POST', '/api/auth/login', { email, password, remember: !!remember });
            setToken(data.token, remember);
            return data.user;
        },
        logout() {
            clearToken();
            location.href = '/index.html';
        },
        requireAuth() {
            if (!getToken()) location.replace('/index.html');
        },
        listItems(params) {
            return request('GET', '/api/items?' + new URLSearchParams(params || {})).then(function (d) { return d.items; });
        },
        createItem(item) {
            return request('POST', '/api/items', item);
        },
        resolveItem(id) {
            return request('PATCH', '/api/items/' + id + '/resolve');
        },
        matchesFor(id) {
            return request('GET', '/api/items/' + id + '/matches').then(function (d) { return d.matches; });
        },
        deleteItem(id) {
            return request('DELETE', '/api/items/' + id);
        }
    };
})();
