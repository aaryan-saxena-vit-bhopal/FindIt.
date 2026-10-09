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
            err.details = data.details;
            throw err;
        }
        return data;
    }

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    // Amber "Possible match" badge that expands to show the matching items.
    function matchBadge(item) {
        const ms = item.matches || [];
        if (!ms.length) return '';
        const other = item.type === 'lost' ? 'found' : 'lost';
        const rows = ms.map(function (m) {
            return '<li class="py-1 border-t border-amber-200 first:border-0">' +
                '<span class="font-bold">' + esc(m.name) + '</span> ' +
                '<span class="text-amber-700">(' + esc(m.location) + ', ' + esc(m.date) + ')</span><br>' +
                '<span class="font-mono text-[10px]">' + esc(m.reporter) + ' - ' + esc(m.contactInfo) + '</span></li>';
        }).join('');
        return '<details class="mt-1.5 text-[11px]">' +
            '<summary class="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800 border border-amber-300 select-none">' +
            '<i class="fa-solid fa-circle-exclamation"></i> ' + (item.type === 'lost' ? 'Similar item already found' : 'Someone reported this lost') + (ms.length > 1 ? ' (' + ms.length + ')' : '') + '</summary>' +
            '<div class="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">' +
            '<div class="font-semibold mb-0.5">' + (item.type === 'lost' ? 'Found by:' : 'Reported lost by:') + '</div>' +
            '<ul>' + rows + '</ul></div></details>';
    }

    window.Api = {
        matchBadge: matchBadge,
        async register(form) {
            const data = await request('POST', '/api/auth/register', form);
            setToken(data.token, false);
            return data.user;
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
        deleteItem(id) {
            return request('DELETE', '/api/items/' + id);
        }
    };
})();
