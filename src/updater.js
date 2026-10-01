const fs = require('fs');
const path = require('path');
const https = require('https');

const APP_DIR = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const LOCAL_VERSION_PATH = path.join(APP_DIR, 'version.json');
const CONFIG_SALAO_PATH = path.join(APP_DIR, 'config_salao.json');

// Função auxiliar para download HTTPS com timeout e suporte opcional a token
function downloadTexto(url, timeoutMs = 5000, token = '') {
    return new Promise((resolve, reject) => {
        const headers = { 
            'User-Agent': 'BarbeariaBot-Updater' 
        };
        if (token) {
            headers['Authorization'] = `token ${token}`;
            headers['Accept'] = 'application/vnd.github.v3.raw';
        }

        const req = https.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadTexto(res.headers.location, timeoutMs, token).then(resolve).catch(reject);
            }
            if (res.statusCode === 404) {
                return reject(new Error('404 Not Found (O repositório no GitHub é PRIVADO ou o arquivo não existe)'));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Status HTTP: ${res.statusCode}`));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error('Timeout de conexão'));
        });
    });
}

function obterVersaoLocal() {
    try {
        if (fs.existsSync(LOCAL_VERSION_PATH)) {
            return JSON.parse(fs.readFileSync(LOCAL_VERSION_PATH, 'utf8'));
        }
    } catch (e) {}

    return {
        version: "1.0.0",
        githubRepo: "jonatan/botsalaorev",
        branch: "main",
        filesToSync: [
            "public/index.html",
            "public/css/style.css",
            "public/js/app.js"
        ]
    };
}

function limparRepo(urlOuNome) {
    if (!urlOuNome) return 'JonatanGomesF/barbearia-bot';
    return urlOuNome
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\//, '')
        .trim();
}

async function verificarEAtualizarLayout(forcado = false) {
    const localInfo = obterVersaoLocal();

    // Permite sobrescrever o repo via config_salao.json caso o usuário queira
    let repo = limparRepo(localInfo.githubRepo || 'JonatanGomesF/barbearia-bot');
    let branch = localInfo.branch || 'main';
    let token = localInfo.githubToken || '';

    try {
        if (fs.existsSync(CONFIG_SALAO_PATH)) {
            const extraCfg = JSON.parse(fs.readFileSync(CONFIG_SALAO_PATH, 'utf8'));
            if (extraCfg.githubRepo) repo = limparRepo(extraCfg.githubRepo);
            if (extraCfg.branch) branch = extraCfg.branch;
            if (extraCfg.githubToken) token = extraCfg.githubToken;
        }
    } catch (e) {}

    const versionUrl = `https://raw.githubusercontent.com/${repo}/${branch}/version.json?t=${Date.now()}`;

    console.log(`🌐 [AUTO-UPDATE] Checando atualizações de layout no GitHub (${repo}@${branch})...`);

    try {
        const remoteVersionRaw = await downloadTexto(versionUrl, 5000, token);
        const remoteInfo = JSON.parse(remoteVersionRaw);

        if (!remoteInfo || !remoteInfo.version) {
            console.log(`ℹ️ [AUTO-UPDATE] Resposta remota inválida.`);
            return { updated: false, currentVersion: localInfo.version };
        }

        const isNewer = (remoteInfo.version !== localInfo.version);

        if (isNewer || forcado) {
            console.log(`✨ [AUTO-UPDATE] Nova versão detectada: v${remoteInfo.version} (Atual: v${localInfo.version}). Baixando arquivos...`);
            
            const files = remoteInfo.filesToSync || [
                "public/index.html",
                "public/css/style.css",
                "public/js/app.js"
            ];

            let countSucesso = 0;

            for (const relPath of files) {
                try {
                    const fileUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${relPath}?t=${Date.now()}`;
                    const content = await downloadTexto(fileUrl, 6000, token);
                    
                    const localTarget = path.join(APP_DIR, relPath);
                    const localTargetDir = path.dirname(localTarget);
                    
                    if (!fs.existsSync(localTargetDir)) {
                        fs.mkdirSync(localTargetDir, { recursive: true });
                    }

                    fs.writeFileSync(localTarget, content, 'utf8');
                    countSucesso++;
                    console.log(`   ✅ Sincronizado: ${relPath}`);
                } catch (errFile) {
                    console.error(`   ⚠️ Falha ao baixar ${relPath}:`, errFile.message);
                }
            }

            if (countSucesso > 0) {
                // Atualiza o version.json local
                const updatedVersionData = {
                    ...localInfo,
                    version: remoteInfo.version,
                    updatedAt: new Date().toISOString()
                };
                fs.writeFileSync(LOCAL_VERSION_PATH, JSON.stringify(updatedVersionData, null, 2), 'utf8');
                console.log(`🎉 [AUTO-UPDATE] Atualização v${remoteInfo.version} aplicada com sucesso! (${countSucesso} arquivos)`);
                return {
                    updated: true,
                    newVersion: remoteInfo.version,
                    previousVersion: localInfo.version,
                    filesCount: countSucesso
                };
            }
        } else {
            console.log(`✅ [AUTO-UPDATE] Layout já está na versão mais recente (v${localInfo.version}).`);
            return { updated: false, currentVersion: localInfo.version };
        }
    } catch (err) {
        console.log(`ℹ️ [AUTO-UPDATE] Não foi possível verificar novidades no GitHub (${err.message}). Mantendo layout local.`);
        return { updated: false, currentVersion: localInfo.version, error: err.message };
    }

    return { updated: false, currentVersion: localInfo.version };
}

module.exports = {
    verificarEAtualizarLayout,
    obterVersaoLocal
};
