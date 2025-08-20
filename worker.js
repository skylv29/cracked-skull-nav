export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;
  
      // API request routing
      if (path.startsWith('/api/')) {
        return handleAPI(request, env);
      }
  
      // Serve background images
      if (path.startsWith('/background-image/')) {
        const index = parseInt(path.split('/')[2], 10);
        const config = await env.KV.get('site_config', 'json');
        if (config && config.backgroundImages && config.backgroundImages[index]) {
          const [header, base64Data] = config.backgroundImages[index].split(',');
          const mimeType = header.match(/:(.*?);/)[1];
          const buffer = atob(base64Data);
          let u8arr = new Uint8Array(buffer.length);
          for(let i = 0; i < buffer.length; i++){
              u8arr[i] = buffer.charCodeAt(i);
          }
          return new Response(u8arr, {
            headers: { 'Content-Type': mimeType }
          });
        }
        return new Response('Not Found', { status: 404 });
      }
  
      // Return the main HTML page
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  };
  
  // --- API Handler ---
  async function handleAPI(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
  
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
  
    try {
      if (path === '/api/login') return handleLogin(request, env, corsHeaders);
      if (path === '/api/guest-login') return handleGuestLogin(request, env, corsHeaders);
      if (path === '/api/config') {
        if (method === 'GET') return handleGetConfig(request, env, corsHeaders);
        if (method === 'POST') return handleUpdateConfig(request, env, corsHeaders);
      }
      if (path === '/api/categories') {
        if (method === 'GET') return handleGetCategories(request, env, corsHeaders);
        if (method === 'POST') return handleUpdateCategories(request, env, corsHeaders);
      }
      if (path === '/api/background') {
        if (method === 'POST') return handleUploadBackground(request, env, corsHeaders);
        if (method === 'DELETE') return handleDeleteBackground(request, env, corsHeaders);
      }
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  // --- Authentication & Authorization ---
  async function handleLogin(request, env, corsHeaders) {
    const { username, password } = await request.json();
    const adminKeys = Object.keys(env).filter(k => k.startsWith('ADMIN'));
    for (const key of adminKeys) {
      const [u, p] = env[key].split(':');
      if (username === u && password === p) {
        return new Response(JSON.stringify({
          success: true,
          role: 'admin',
          token: generateToken(username, 'admin')
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ success: false, message: '用户名或密码错误' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  async function handleGuestLogin(request, env, corsHeaders) {
    const { username, password } = await request.json();
    const userKeys = Object.keys(env).filter(k => k.startsWith('USER'));
    for (const key of userKeys) {
      const [u, p] = env[key].split(':');
      if (username === u && password === p) {
        return new Response(JSON.stringify({
          success: true,
          role: 'guest',
          token: generateToken(username, 'guest')
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ success: false, message: '访客账号或密码错误' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  async function verifyAdmin(request) {
    const auth = request.headers.get('Authorization');
    if (!auth) return false;
    const token = auth.replace('Bearer ', '');
    try {
      const decoded = atob(token);
      const [_username, role, _timestamp] = decoded.split(':');
      return role === 'admin';
    } catch (e) {
      return false;
    }
  }
  
  function generateToken(username, role) {
    return btoa(`${username}:${role}:${Date.now()}`);
  }
  
  // --- Config Management ---
  async function handleGetConfig(request, env, corsHeaders) {
    let config = await env.KV.get('site_config', 'json');
    if (!config) {
      config = {
        title: '我的导航',
        chineseTitle: '连接万物，导航无限可能',
        backgroundImages: []
      };
      await env.KV.put('site_config', JSON.stringify(config));
    }
    
    const clientConfig = { ...config };
    if (clientConfig.backgroundImages && clientConfig.backgroundImages.length > 0) {
        clientConfig.backgroundImageUrls = clientConfig.backgroundImages.map((_, i) => `/background-image/${i}`);
    } else {
        clientConfig.backgroundImageUrls = [];
    }
    delete clientConfig.backgroundImages;
    return new Response(JSON.stringify(clientConfig), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  async function handleUpdateConfig(request, env, corsHeaders) {
    if (!await verifyAdmin(request)) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const newConfigData = await request.json();
    let currentConfig = await env.KV.get('site_config', 'json') || {};
    
    currentConfig.title = newConfigData.title;
    currentConfig.chineseTitle = newConfigData.chineseTitle;
  
    if (newConfigData.resetBackground) {
      currentConfig.backgroundImages = [];
    }
  
    await env.KV.put('site_config', JSON.stringify(currentConfig));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  // --- Background Image Management ---
  async function handleUploadBackground(request, env, corsHeaders) {
    if (!await verifyAdmin(request)) return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    try {
      const formData = await request.formData();
      const file = formData.get('background');
      if (!file) return new Response(JSON.stringify({ error: '未找到文件' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!file.type.startsWith('image/')) return new Response(JSON.stringify({ error: '只支持图片文件' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const dataUrl = `data:${file.type};base64,${base64}`;
      let config = await env.KV.get('site_config', 'json') || {};
      if (!config.backgroundImages) config.backgroundImages = [];
      config.backgroundImages.push(dataUrl);
      await env.KV.put('site_config', JSON.stringify(config));
      const newImageIndex = config.backgroundImages.length - 1;
      return new Response(JSON.stringify({ success: true, backgroundImageUrl: `/background-image/${newImageIndex}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ error: '上传失败: ' + error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }
  
  async function handleDeleteBackground(request, env, corsHeaders) {
      if (!await verifyAdmin(request)) return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      try {
          const { index } = await request.json();
          let config = await env.KV.get('site_config', 'json');
          if (config && config.backgroundImages && config.backgroundImages[index]) {
              config.backgroundImages.splice(index, 1);
              await env.KV.put('site_config', JSON.stringify(config));
              return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ error: '图片未找到' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
          return new Response(JSON.stringify({ error: '删除失败: ' + error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
  }
  
  // --- Category & Link Management ---
  async function handleGetCategories(request, env, corsHeaders) {
      const url = new URL(request.url);
      const token = url.searchParams.get('token');
      let role = 'public';
  
      if (token) {
          try {
              const decoded = atob(token);
              const [_username, userRole, _timestamp] = decoded.split(':');
              if (userRole === 'guest' || userRole === 'admin') {
                  role = userRole;
              }
          } catch (e) { /* Invalid token, treat as public */ }
      }
  
      let categories = await env.KV.get('categories', 'json');
      if (!categories) {
          categories = getDefaultCategories();
          await env.KV.put('categories', JSON.stringify(categories));
      }
  
      if (role === 'public') {
          categories = categories
              .filter(c => !c.isPrivate)
              .map(c => {
                  if (c.subcategories) {
                      c.subcategories = c.subcategories.filter(s => !s.isPrivate);
                  }
                  return c;
              });
      }
      return new Response(JSON.stringify(categories), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  async function handleUpdateCategories(request, env, corsHeaders) {
    if (!await verifyAdmin(request)) return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const categories = await request.json();
    await env.KV.put('categories', JSON.stringify(categories));
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  // --- Default Data ---
  function getDefaultCategories() {
      return [
          { id: 'cat_1', name: '常用工具', icon: 'globe', isPrivate: false, order: 1, subcategories: [], links: [
              { id: 'link_101', name: 'Google', url: 'https://www.google.com', icon: 'fab fa-google', description: '全球最大的搜索引擎' },
              { id: 'link_102', name: 'YouTube', url: 'https://www.youtube.com', icon: 'fab fa-youtube', description: '全球最大的视频分享网站' },
              { id: 'link_103', name: '百度', url: 'https://www.baidu.com', icon: 'fas fa-search', description: '中文搜索引擎' },
              { id: 'link_104', name: 'GitHub', url: 'https://github.com', icon: 'fab fa-github', description: '代码托管与协作平台' },
          ]},
          { id: 'cat_2', name: 'AI 助手', icon: 'robot', isPrivate: false, order: 2, subcategories: [], links: [
              { id: 'link_201', name: 'Claude', url: 'https://claude.ai', icon: 'fas fa-brain', description: 'Anthropic 开发的AI助手' },
              { id: 'link_202', name: 'Kimi', url: 'https://kimi.moonshot.cn/', icon: 'fas fa-rocket', description: 'Moonshot AI 长文本智能助手' },
              { id: 'link_203', name: 'Gemini', url: 'https://gemini.google.com', icon: 'fas fa-gem', description: 'Google 出品的多模态AI模型' },
              { id: 'link_204', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'fas fa-comments', description: 'OpenAI 旗下对话式AI' },
          ]},
          { id: 'cat_3', name: '秘密收藏', icon: 'lock', isPrivate: true, order: 3, subcategories: [
              { id: 'sub_1', name: '个人项目', isPrivate: true, links: [
                   { id: 'link_301', name: 'Cloudflare', url: 'https://dash.cloudflare.com/', icon: 'fas fa-cloud', description: '全球网络安全与性能服务' },
              ]}
          ], links: []}
      ];
  }
  
  // --- Frontend HTML ---
  function getHTML() {
    return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
  <meta charset="UTF-8">
  <title>个人导航</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap');
  :root { 
    --modal-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08));
    --modal-border: rgba(255, 255, 255, 0.2);
    --input-bg: rgba(255, 255, 255, 0.08);
    --btn-primary-bg: linear-gradient(45deg, #4f46e5, #7c3aed);
    --btn-secondary-bg: rgba(255, 255, 255, 0.1);
    --card-bg: rgba(255, 255, 255, 0.08);
    --card-border: rgba(255, 255, 255, 0.15);
  }
  * { 
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body { 
    font-family: 'Inter', 'Noto Sans SC', sans-serif;
    background: #0a0a0f;
    min-height: 100vh;
    color: white;
    overflow-x: hidden;
    position: relative;
  }
  .stellar-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
    background: 
      radial-gradient(ellipse at center, rgba(29, 39, 99, 0.4) 0%, transparent 70%),
      radial-gradient(ellipse at 20% 80%, rgba(120, 58, 237, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 20%, rgba(79, 70, 229, 0.15) 0%, transparent 50%),
      linear-gradient(45deg, #0a0a0f 0%, #1a1625 50%, #0f0a1a 100%);
  }
  .stars {
    position: absolute;
    width: 100%;
    height: 100%;
  }
  .stars::before,
  .stars::after {
    content: '';
    position: absolute;
    width: 2px;
    height: 2px;
    background: white;
    box-shadow: 
      20px 30px white, 40px 70px white, 90px 40px white, 130px 80px white,
      160px 30px white, 200px 90px white, 240px 50px white, 280px 120px white,
      320px 80px white, 360px 40px white, 400px 110px white, 440px 70px white,
      480px 20px white, 520px 100px white, 560px 60px white, 600px 140px white,
      640px 90px white, 680px 30px white, 720px 120px white, 760px 80px white,
      800px 50px white, 840px 110px white, 880px 70px white, 920px 150px white,
      960px 40px white, 1000px 130px white, 1040px 90px white, 1080px 20px white,
      1120px 100px white, 1160px 60px white, 1200px 180px white, 1240px 120px white;
    animation: sparkle 3s linear infinite;
    border-radius: 50%;
  }
  .stars::after {
    box-shadow: 
      60px 80px rgba(255,255,255,0.5), 120px 50px rgba(255,255,255,0.6), 180px 130px rgba(255,255,255,0.4),
      220px 70px rgba(255,255,255,0.7), 300px 40px rgba(255,255,255,0.5), 340px 160px rgba(255,255,255,0.6),
      420px 90px rgba(255,255,255,0.4), 500px 120px rgba(255,255,255,0.8), 580px 30px rgba(255,255,255,0.5),
      660px 170px rgba(255,255,255,0.6), 740px 60px rgba(255,255,255,0.7), 820px 140px rgba(255,255,255,0.4),
      900px 100px rgba(255,255,255,0.5), 1000px 70px rgba(255,255,255,0.6), 1100px 190px rgba(255,255,255,0.8);
    animation: sparkle 4s linear infinite reverse;
  }
  @keyframes sparkle {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
  .meteor {
    position: absolute;
    width: 2px;
    height: 2px;
    background: linear-gradient(45deg, #ffffff, transparent);
    animation: meteor 8s linear infinite;
  }
  .meteor:nth-child(1) { top: 20%; left: -5%; animation-delay: 0s; }
  .meteor:nth-child(2) { top: 40%; left: -5%; animation-delay: 3s; }
  .meteor:nth-child(3) { top: 60%; left: -5%; animation-delay: 6s; }
  @keyframes meteor {
    0% { 
      transform: translateX(0) translateY(0) rotate(45deg); 
      opacity: 1; 
      box-shadow: 0 0 20px 2px rgba(255,255,255,0.8); 
    }
    70% { opacity: 1; }
    100% { 
      transform: translateX(100vw) translateY(50vh) rotate(45deg); 
      opacity: 0; 
      box-shadow: 0 0 20px 2px rgba(255,255,255,0.1); 
    }
  }
  .nebula {
    position: absolute;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, transparent 70%);
    border-radius: 50%;
    animation: drift 20s ease-in-out infinite;
    filter: blur(40px);
  }
  .nebula:nth-child(1) { top: 10%; right: 20%; animation-delay: 0s; }
  .nebula:nth-child(2) { bottom: 20%; left: 10%; animation-delay: 10s; }
  @keyframes drift {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(50px, -30px) scale(1.2); }
  }
  .container { 
    position: relative; 
    z-index: 10; 
    min-height: 100vh; 
    display: flex; 
    flex-direction: column; 
    padding: 40px 20px 20px; 
    max-width: 1200px; 
    margin: 0 auto; 
  }
  .header { 
    text-align: center; 
    margin-bottom: 50px; 
  }
  .site-title { 
    font-size: 3.5rem; 
    font-weight: 700; 
    margin-bottom: 10px; 
    background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 50%, #c7d2fe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.5);
    position: relative;
  }
  .site-title::after {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, transparent, #4f46e5, transparent);
    border-radius: 2px;
  }
  .site-subtitle { 
    font-size: 1.3rem; 
    font-weight: 300; 
    opacity: 0.8; 
    color: #e0e7ff;
  }
  .categories-container { 
    flex: 1; 
    margin-bottom: 50px; 
  }
  .category-section { 
    margin-bottom: 50px; 
  }
  .category-title { 
    font-size: 1.8rem; 
    font-weight: 600; 
    margin-bottom: 25px; 
    display: flex; 
    align-items: center; 
    gap: 12px; 
    color: #f1f5f9;
    position: relative;
  }
  .category-title::before {
    content: '';
    position: absolute;
    left: -10px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 20px;
    background: linear-gradient(180deg, #4f46e5, #7c3aed);
    border-radius: 2px;
  }
  .category-title i { 
    font-size: 1.4rem; 
    opacity: 0.9; 
    color: #6366f1;
  }
  .category-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); 
    gap: 20px; 
    margin-bottom: 35px; 
  }
  .link-item { 
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 10px; 
    padding: 20px 12px; 
    background: var(--card-bg); 
    border-radius: 16px; 
    border: 1px solid var(--card-border); 
    backdrop-filter: blur(20px); 
    text-decoration: none; 
    color: white; 
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
    cursor: pointer; 
    min-height: 100px; 
    justify-content: center; 
    position: relative;
    overflow: hidden;
  }
  .link-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transition: left 0.5s;
  }
  .link-item:hover::before {
    left: 100%;
  }
  .link-item:hover { 
    transform: translateY(-8px) scale(1.05); 
    background: rgba(255, 255, 255, 0.12); 
    border-color: rgba(255, 255, 255, 0.3); 
    box-shadow: 
      0 20px 40px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(79, 70, 229, 0.3);
  }
  .link-icon { 
    font-size: 28px; 
    opacity: 0.9; 
    transition: all 0.3s ease;
  }
  .link-item:hover .link-icon {
    transform: scale(1.2);
    filter: drop-shadow(0 0 8px rgba(79, 70, 229, 0.6));
  }
  .link-name { 
    font-size: 13px; 
    font-weight: 500; 
    text-align: center; 
    line-height: 1.3; 
    max-width: 100%; 
    word-break: break-word; 
    opacity: 0.9;
  }
  .subcategory-container {
    display: flex;
    flex-wrap: wrap;
    gap: 40px;
    align-items: flex-start;
  }
  .subcategory-item {
    flex: 1;
    min-width: 300px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 20px;
    padding: 25px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(15px);
    position: relative;
    overflow: hidden;
  }
  .subcategory-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #4f46e5, #7c3aed, #ec4899);
    border-radius: 20px 20px 0 0;
  }
  .subcategory-item:nth-child(even) {
    background: rgba(124, 58, 237, 0.06);
  }
  .subcategory-item:nth-child(even) .category-grid {
    direction: rtl;
  }
  .subcategory-item:nth-child(even) .category-grid .link-item {
    direction: ltr;
  }
  .subcategory-title { 
    font-size: 1.3rem; 
    font-weight: 600; 
    margin-bottom: 20px; 
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .subcategory-title::before {
    content: '';
    width: 8px;
    height: 8px;
    background: linear-gradient(45deg, #4f46e5, #7c3aed);
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(79, 70, 229, 0.5);
  }
  .search-section { 
    display: flex; 
    flex-wrap: wrap; 
    gap: 20px; 
    justify-content: center; 
    margin-bottom: 30px; 
  }
  .search-box { 
    flex: 1 1 300px; 
    max-width: 400px; 
    background: var(--card-bg); 
    border-radius: 50px; 
    padding: 15px 25px; 
    border: 1px solid var(--card-border); 
    backdrop-filter: blur(20px); 
    display: flex; 
    align-items: center; 
    gap: 12px; 
    transition: all 0.4s ease; 
    position: relative;
    overflow: hidden;
  }
  .search-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, rgba(79, 70, 229, 0.1), rgba(124, 58, 237, 0.1));
    opacity: 0;
    transition: opacity 0.3s ease;
    border-radius: 50px;
  }
  .search-box:hover::before {
    opacity: 1;
  }
  .search-box:hover { 
    background: rgba(255, 255, 255, 0.1); 
    border-color: rgba(255, 255, 255, 0.3); 
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  }
  .search-icon { 
    font-size: 18px; 
    opacity: 0.8; 
    z-index: 1;
  }
  .search-input { 
    flex: 1; 
    background: none; 
    border: none; 
    color: white; 
    font-size: 16px; 
    outline: none; 
    z-index: 1;
  }
  .search-input::placeholder { 
    color: rgba(255, 255, 255, 0.6); 
  }
  .search-btn { 
    background: linear-gradient(45deg, #4f46e5, #7c3aed); 
    border: none; 
    padding: 10px 20px; 
    border-radius: 25px; 
    color: white; 
    cursor: pointer; 
    transition: all 0.3s ease; 
    font-weight: 500; 
    z-index: 1;
  }
  .search-btn:hover { 
    background: linear-gradient(45deg, #6366f1, #8b5cf6); 
    transform: scale(1.05); 
    box-shadow: 0 5px 15px rgba(79, 70, 229, 0.4);
  }
  .login-section { 
    position: fixed; 
    bottom: 30px; 
    left: 30px; 
    right: 30px; 
    display: flex; 
    justify-content: space-between; 
    z-index: 15; 
    pointer-events: none; 
  }
  .login-btn { 
    pointer-events: all; 
    padding: 15px 25px; 
    background: var(--card-bg); 
    border: 1px solid var(--card-border); 
    border-radius: 30px; 
    color: white; 
    cursor: pointer; 
    transition: all 0.4s ease; 
    backdrop-filter: blur(20px); 
    font-weight: 500; 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    position: relative;
    overflow: hidden;
  }
  .login-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    transition: left 0.5s;
  }
  .login-btn:hover::before {
    left: 100%;
  }
  .login-btn:hover { 
    background: rgba(255, 255, 255, 0.15); 
    border-color: rgba(255, 255, 255, 0.4); 
    transform: translateY(-3px); 
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }
  .modal { 
    display: none; 
    position: fixed; 
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%; 
    background: rgba(0, 0, 0, 0.8); 
    z-index: 1000; 
    backdrop-filter: blur(15px); 
    align-items: center; 
    justify-content: center; 
  }
  .modal.show { 
    display: flex; 
  }
  .modal-content { 
    background: var(--modal-bg); 
    border: 1px solid var(--modal-border); 
    border-radius: 25px; 
    backdrop-filter: blur(25px); 
    padding: 35px; 
    width: 90%; 
    max-width: 500px; 
    max-height: 90vh; 
    overflow-y: auto; 
    color: white; 
    position: relative;
  }
  .modal-content::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #4f46e5, #7c3aed, #ec4899);
    border-radius: 25px 25px 0 0;
  }
  .modal-header { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    margin-bottom: 30px; 
  }
  .modal-title { 
    font-size: 1.6rem; 
    font-weight: 600; 
    color: #f1f5f9;
  }
  .close-btn { 
    background: rgba(255, 255, 255, 0.1); 
    border: 1px solid rgba(255, 255, 255, 0.2); 
    color: rgba(255, 255, 255, 0.8); 
    font-size: 24px; 
    cursor: pointer; 
    padding: 8px 12px; 
    border-radius: 50%; 
    transition: all 0.3s ease; 
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn:hover { 
    background: rgba(255, 255, 255, 0.2); 
    color: white; 
    transform: rotate(90deg);
  }
  .form-group { 
    margin-bottom: 25px; 
  }
  .form-label { 
    display: block; 
    margin-bottom: 10px; 
    font-weight: 500; 
    opacity: 0.9; 
    color: #e2e8f0;
  }
  .form-input, .form-textarea { 
    width: 100%; 
    padding: 15px 20px; 
    background: var(--input-bg); 
    border: 1px solid var(--modal-border); 
    border-radius: 12px; 
    color: white; 
    font-size: 16px; 
    transition: all 0.3s ease; 
  }
  .form-input:focus, .form-textarea:focus { 
    outline: none; 
    border-color: #6366f1; 
    background: rgba(255, 255, 255, 0.12); 
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
  .form-input::placeholder, .form-textarea::placeholder { 
    color: rgba(255, 255, 255, 0.5); 
  }
  .btn { 
    padding: 15px 30px; 
    border: none; 
    border-radius: 12px; 
    cursor: pointer; 
    font-weight: 500; 
    transition: all 0.3s ease; 
    font-size: 14px; 
    display: inline-flex; 
    align-items: center; 
    gap: 8px; 
    position: relative;
    overflow: hidden;
  }
  .btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s;
  }
  .btn:hover::before {
    left: 100%;
  }
  .btn-primary { 
    background: var(--btn-primary-bg); 
    color: white; 
  }
  .btn-primary:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 10px 25px rgba(79, 70, 229, 0.4); 
  }
  .btn-secondary { 
    background: var(--btn-secondary-bg); 
    color: white; 
    border: 1px solid var(--modal-border); 
  }
  .btn-secondary:hover { 
    background: rgba(255, 255, 255, 0.2); 
    transform: translateY(-2px);
  }
  .modal-footer { 
    display: flex; 
    justify-content: flex-end; 
    gap: 15px; 
    margin-top: 30px; 
  }
  .admin-panel { 
    position: fixed; 
    top: 0; 
    right: -500px; 
    width: 100%; 
    max-width: 500px; 
    height: 100vh; 
    background: var(--modal-bg); 
    border-left: 1px solid var(--modal-border); 
    backdrop-filter: blur(25px); 
    transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
    z-index: 1001; 
    display: flex; 
    flex-direction: column; 
    color: white; 
  }
  .admin-panel.open { 
    right: 0; 
  }
  .admin-header { 
    padding: 25px; 
    border-bottom: 1px solid rgba(255, 255, 255, 0.15); 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(124, 58, 237, 0.1));
  }
  .admin-body { 
    padding: 25px; 
    overflow-y: auto; 
    flex: 1; 
  }
  .admin-section { 
    margin-bottom: 35px; 
  }
  .admin-section h3 { 
    font-size: 1.3rem; 
    margin-bottom: 20px; 
    color: #f1f5f9; 
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .file-upload-area { 
    border: 2px dashed var(--modal-border); 
    border-radius: 15px; 
    padding: 35px; 
    text-align: center; 
    cursor: pointer; 
    transition: all 0.3s ease; 
    margin-bottom: 20px; 
    background: rgba(255, 255, 255, 0.02);
  }
  .file-upload-area:hover { 
    border-color: #6366f1; 
    background: rgba(99, 102, 241, 0.05); 
    transform: translateY(-2px);
  }
  .file-upload-area.dragover { 
    border-color: #7c3aed; 
    background: rgba(124, 58, 237, 0.1); 
  }
  #backgroundInput { 
    display: none; 
  }
  .upload-icon { 
    font-size: 36px; 
    margin-bottom: 15px; 
    opacity: 0.7; 
    color: #6366f1;
  }
  #bg-manager { 
    display: grid; 
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); 
    gap: 15px; 
    margin-bottom: 20px; 
  }
  .bg-thumbnail { 
    position: relative; 
    border-radius: 12px;
    overflow: hidden;
    transition: transform 0.3s ease;
  }
  .bg-thumbnail:hover {
    transform: scale(1.05);
  }
  .bg-thumbnail img { 
    width: 100%; 
    height: 70px; 
    object-fit: cover; 
    border-radius: 12px; 
    border: 1px solid var(--modal-border); 
  }
  .bg-delete-btn { 
    position: absolute; 
    top: 8px; 
    right: 8px; 
    background: rgba(239, 68, 68, 0.8); 
    color: white; 
    border: none; 
    border-radius: 50%; 
    width: 24px; 
    height: 24px; 
    cursor: pointer; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    font-size: 14px; 
    transition: all 0.3s ease;
  }
  .bg-delete-btn:hover {
    background: rgba(239, 68, 68, 1);
    transform: scale(1.1);
  }
  .category-item, .draggable-item { 
    background: rgba(255, 255, 255, 0.06); 
    border-radius: 15px; 
    padding: 20px; 
    margin-bottom: 15px; 
    border: 1px solid rgba(255, 255, 255, 0.1); 
    transition: all 0.3s ease;
  }
  .category-item:hover, .draggable-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }
  .category-item.dragging, .draggable-item.dragging { 
    opacity: 0.6; 
    background: rgba(255, 255, 255, 0.2); 
    transform: rotate(5deg);
  }
  .category-header { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
  }
  .drag-handle { 
    cursor: grab; 
    margin-right: 15px; 
    opacity: 0.6; 
    color: #6366f1;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .category-controls { 
    display: flex; 
    gap: 8px; 
  }
  .icon-btn { 
    background: rgba(255, 255, 255, 0.08); 
    border: 1px solid rgba(255, 255, 255, 0.15); 
    color: white; 
    padding: 10px; 
    border-radius: 8px; 
    cursor: pointer; 
    font-size: 12px; 
    transition: all 0.3s ease; 
  }
  .icon-btn:hover { 
    background: rgba(255, 255, 255, 0.15); 
    transform: translateY(-1px);
  }
  .notification { 
    position: fixed; 
    top: 30px; 
    right: 30px; 
    padding: 20px 25px; 
    border-radius: 15px; 
    color: white; 
    z-index: 2000; 
    opacity: 0; 
    transform: translateX(100%); 
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
    backdrop-filter: blur(20px); 
    min-width: 300px;
  }
  .notification.show { 
    opacity: 1; 
    transform: translateX(0); 
  }
  .notification.success { 
    background: linear-gradient(45deg, rgba(34, 197, 94, 0.9), rgba(22, 163, 74, 0.9)); 
    border: 1px solid rgba(34, 197, 94, 0.5); 
  }
  .notification.error { 
    background: linear-gradient(45deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9)); 
    border: 1px solid rgba(239, 68, 68, 0.5); 
  }
  .loading { 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    height: 200px; 
    flex-direction: column; 
    gap: 20px; 
  }
  .spinner { 
    width: 45px; 
    height: 45px; 
    border: 3px solid rgba(255, 255, 255, 0.2); 
    border-top: 3px solid #6366f1; 
    border-radius: 50%; 
    animation: spin 1s linear infinite; 
  }
  @keyframes spin { 
    0% { transform: rotate(0deg); } 
    100% { transform: rotate(360deg); } 
  }
  @media (max-width: 768px) { 
    .container { padding: 20px 15px; } 
    .site-title { font-size: 2.5rem; } 
    .site-subtitle { font-size: 1.1rem; } 
    .category-grid { 
      grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); 
      gap: 15px; 
    } 
    .login-section { 
      position: relative; 
      bottom: auto; 
      left: auto; 
      right: auto; 
      margin-top: 30px; 
      padding-bottom: 20px; 
      justify-content: center; 
      gap: 20px; 
      flex-wrap: wrap;
    } 
    .admin-panel { width: 100%; right: -100%; } 
    .link-item { min-height: 85px; padding: 15px 10px; } 
    .link-icon { font-size: 22px; } 
    .link-name { font-size: 12px; }
    .subcategory-container { flex-direction: column; gap: 25px; }
    .subcategory-item { min-width: unset; }
    .subcategory-item:nth-child(even) .category-grid { direction: ltr; }
  }
  @media (max-width: 480px) { 
    .category-grid { 
      grid-template-columns: repeat(auto-fill, minmax(65px, 1fr)); 
      gap: 12px; 
    } 
    .link-item { min-height: 75px; padding: 12px 8px; } 
    .link-icon { font-size: 20px; } 
    .link-name { font-size: 11px; }
    .site-title { font-size: 2rem; }
    .modal-content { margin: 20px; width: calc(100% - 40px); }
  }
  </style>
  </head>
  <body>
  <div class="stellar-background">
    <div class="stars"></div>
    <div class="meteor"></div>
    <div class="meteor"></div>
    <div class="meteor"></div>
    <div class="nebula"></div>
    <div class="nebula"></div>
  </div>
  
  <div class="container">
      <header class="header">
          <h1 class="site-title" id="siteTitle">个人导航</h1>
          <p class="site-subtitle" id="siteSubtitle">正在加载...</p>
      </header>
      <main class="categories-container" id="categoriesContainer">
          <div class="loading"><div class="spinner"></div><span>加载中...</span></div>
      </main>
      <section class="search-section">
          <form class="search-box" onsubmit="searchGoogle(event)">
              <i class="fab fa-google search-icon"></i>
              <input type="text" class="search-input" placeholder="Google 搜索..." required>
              <button type="submit" class="search-btn">搜索</button>
          </form>
          <form class="search-box" onsubmit="searchBaidu(event)">
              <i class="fas fa-search search-icon"></i>
              <input type="text" class="search-input" placeholder="百度搜索..." required>
              <button type="submit" class="search-btn">搜索</button>
          </form>
      </section>
      <div class="login-section">
          <button class="login-btn" onclick="openGuestModal()"><i class="fas fa-user"></i>访客登录</button>
          <button class="login-btn" onclick="openAdminModal()"><i class="fas fa-cog"></i>管理员</button>
      </div>
  </div>
  
  <!-- Modals -->
  <div class="modal" id="loginModal"><div class="modal-content"><div class="modal-header"><h3 class="modal-title">管理员登录</h3><button class="close-btn" onclick="closeModal('loginModal')">&times;</button></div><form id="loginForm"><div class="form-group"><label class="form-label">用户名</label><input type="text" class="form-input" name="username" required></div><div class="form-group"><label class="form-label">密码</label><input type="password" class="form-input" name="password" required></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeModal('loginModal')">取消</button><button type="submit" class="btn btn-primary"><i class="fas fa-sign-in-alt"></i>登录</button></div></form></div></div>
  <div class="modal" id="guestModal"><div class="modal-content"><div class="modal-header"><h3 class="modal-title">访客验证</h3><button class="close-btn" onclick="closeModal('guestModal')">&times;</button></div><form id="guestForm"><div class="form-group"><label class="form-label">访客用户名</label><input type="text" class="form-input" name="username" required></div><div class="form-group"><label class="form-label">访客密码</label><input type="password" class="form-input" name="password" required></div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeModal('guestModal')">取消</button><button type="submit" class="btn btn-primary"><i class="fas fa-check"></i>验证</button></div></form></div></div>
  <div class="modal" id="editCategoryModal"><div class="modal-content" style="max-width: 700px;"><div class="modal-header"><h3 class="modal-title" id="editCategoryTitle">编辑分类</h3><button class="close-btn" onclick="closeModal('editCategoryModal')">&times;</button></div><div class="modal-body" id="editCategoryFormContainer" style="max-height: 60vh; overflow-y: auto;"></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('editCategoryModal')">取消</button><button class="btn btn-primary" onclick="saveCategoryChanges()"><i class="fas fa-save"></i>保存更改</button></div></div></div>
  
  <!-- Admin Panel -->
  <div class="admin-panel" id="adminPanel">
      <div class="admin-header"><h3>管理面板</h3><button class="close-btn" onclick="closeAdminPanel()">&times;</button></div>
      <div class="admin-body">
          <div class="admin-section"><h3><i class="fas fa-globe"></i> 网站设置</h3><div class="form-group"><label class="form-label">网站标题</label><input type="text" class="form-input" id="editTitle"></div><div class="form-group"><label class="form-label">网站副标题</label><input type="text" class="form-input" id="editSubtitle"></div><button class="btn btn-primary" onclick="updateSiteConfig()"><i class="fas fa-save"></i>保存网站设置</button></div>
          <div class="admin-section"><h3><i class="fas fa-image"></i> 背景管理</h3><div id="bg-manager"></div><div class="file-upload-area" onclick="document.getElementById('backgroundInput').click()"><i class="fas fa-cloud-upload-alt upload-icon"></i><div>点击或拖拽上传新背景</div></div><input type="file" id="backgroundInput" accept="image/*" onchange="uploadBackground(event)"><button class="btn btn-secondary" onclick="resetBackground()"><i class="fas fa-undo"></i>恢复默认背景</button></div>
          <div class="admin-section"><h3><i class="fas fa-folder"></i> 分类管理</h3><div id="categoryManager"></div><button class="btn btn-secondary" onclick="addNewCategory()"><i class="fas fa-plus"></i>添加新分类</button></div>
          <div class="admin-section"><button class="btn btn-secondary" onclick="logout()"><i class="fas fa-sign-out-alt"></i>退出登录</button></div>
      </div>
  </div>
  
  <div class="notification" id="notification"></div>
  
  <script>
  // --- Global State ---
  let currentUser = null;
  let isAdmin = false;
  let siteConfig = {};
  let categories = [];
  let editingCategoryId = null;
  
  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
      loadSiteConfig();
      loadCategories();
      setupFileUpload();
      document.getElementById('loginForm').addEventListener('submit', adminLogin);
      document.getElementById('guestForm').addEventListener('submit', guestLogin);
  });
  
  // --- Site Config & Background ---
  async function loadSiteConfig() {
    try {
      const response = await fetch('/api/config');
      siteConfig = await response.json();
      document.getElementById('siteTitle').textContent = siteConfig.title || '个人导航';
      document.getElementById('siteSubtitle').textContent = siteConfig.chineseTitle || '连接万物';
      document.title = siteConfig.title || '个人导航';
      if (siteConfig.backgroundImageUrls && siteConfig.backgroundImageUrls.length > 0) {
        const randomIndex = Math.floor(Math.random() * siteConfig.backgroundImageUrls.length);
        document.body.style.background = \`url('\${siteConfig.backgroundImageUrls[randomIndex]}') center/cover fixed\`;
        document.querySelector('.stellar-background').style.opacity = '0.3';
      } else {
        document.body.style.background = '';
        document.querySelector('.stellar-background').style.opacity = '1';
      }
    } catch (e) { console.error("Failed to load site config:", e); }
  }
  
  function setupFileUpload() {
      const uploadArea = document.querySelector('.file-upload-area');
      uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
      uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
      uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          const files = e.dataTransfer.files;
          if (files.length > 0 && files[0].type.startsWith('image/')) {
              handleBackgroundUpload(files[0]);
          }
      });
  }
  
  async function uploadBackground(event) {
      const file = event.target.files[0];
      if (file) await handleBackgroundUpload(file);
      event.target.value = '';
  }
  
  async function handleBackgroundUpload(file) {
      if (!isAdmin) return showNotification('需要管理员权限', 'error');
      if (!file.type.startsWith('image/')) return showNotification('请选择图片文件', 'error');
      if (file.size > 5 * 1024 * 1024) return showNotification('图片大小不能超过5MB', 'error');
      try {
          const formData = new FormData();
          formData.append('background', file);
          const response = await fetch('/api/background', { method: 'POST', headers: { 'Authorization': 'Bearer ' + currentUser.token }, body: formData });
          const result = await response.json();
          if (result.success) {
              if (!siteConfig.backgroundImageUrls) siteConfig.backgroundImageUrls = [];
              siteConfig.backgroundImageUrls.push(result.backgroundImageUrl);
              document.body.style.background = \`url('\${result.backgroundImageUrl}?t=\${new Date().getTime()}') center/cover fixed\`;
              document.querySelector('.stellar-background').style.opacity = '0.3';
              renderBackgroundManager();
              showNotification('背景图片上传成功', 'success');
          } else {
              showNotification(result.error || '上传失败', 'error');
          }
      } catch (error) { showNotification('上传失败: ' + error.message, 'error'); }
  }
  
  async function deleteBackground(index) {
      if (!confirm('确定要删除这张背景图片吗？')) return;
      try {
          const response = await fetch('/api/background', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentUser.token },
              body: JSON.stringify({ index })
          });
          if (response.ok) {
              siteConfig.backgroundImageUrls.splice(index, 1);
              renderBackgroundManager();
              showNotification('背景已删除', 'success');
              if (siteConfig.backgroundImageUrls.length === 0) {
                   document.body.style.background = '';
                   document.querySelector('.stellar-background').style.opacity = '1';
              }
          } else { showNotification('删除失败', 'error'); }
      } catch (error) { showNotification('删除失败: ' + error.message, 'error'); }
  }
  
  async function resetBackground() {
      if (!confirm('确定要删除所有自定义背景并恢复默认吗？')) return;
      try {
          const response = await fetch('/api/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentUser.token },
              body: JSON.stringify({ title: siteConfig.title, chineseTitle: siteConfig.chineseTitle, resetBackground: true })
          });
          if (response.ok) {
              document.body.style.background = '';
              document.querySelector('.stellar-background').style.opacity = '1';
              siteConfig.backgroundImageUrls = [];
              renderBackgroundManager();
              showNotification('背景已恢复默认', 'success');
          } else { showNotification('恢复失败', 'error'); }
      } catch (error) { showNotification('恢复失败: ' + error.message, 'error'); }
  }
  
  // --- Categories ---
  async function loadCategories() {
    try {
      const token = currentUser ? currentUser.token : '';
      const response = await fetch(\`/api/categories?token=\${token}\`);
      categories = await response.json();
      renderCategories();
      if (isAdmin) renderCategoryManager();
    } catch (e) { showNotification('加载分类失败', 'error'); }
  }
  
  function renderCategories() {
      const container = document.getElementById('categoriesContainer');
      container.innerHTML = '';
      const sorted = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
      sorted.forEach(category => {
          const section = document.createElement('section');
          section.className = 'category-section';
          let mainLinksHTML = '';
          if (category.links && category.links.length > 0) {
              mainLinksHTML = \`<div class="category-grid">\${category.links.map(createLinkHTML).join('')}</div>\`;
          }
          let subcategoriesHTML = '';
          if (category.subcategories && category.subcategories.length > 0) {
              subcategoriesHTML = \`<div class="subcategory-container">\${category.subcategories.map(sub => {
                  if (sub.links && sub.links.length > 0) {
                      return \`<div class="subcategory-item">
                                  <h3 class="subcategory-title">\${sub.name} \${sub.isPrivate ? '<span style="font-size: 0.7em; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px;">私密</span>' : ''}</h3>
                                  <div class="category-grid">\${sub.links.map(createLinkHTML).join('')}</div>
                              </div>\`;
                  }
                  return '';
              }).join('')}</div>\`;
          }
          section.innerHTML = \`
              <h2 class="category-title"><i class="fas fa-\${category.icon || 'folder'}"></i>\${category.name} \${category.isPrivate ? '<span style="font-size: 0.7em; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px;">私密</span>' : ''}</h2>
              \${mainLinksHTML}
              \${subcategoriesHTML}
          \`;
          container.appendChild(section);
      });
  }
  
  function createLinkHTML(link) {
      const iconClass = link.icon || 'fas fa-external-link-alt';
      return \`<a href="\${link.url}" target="_blank" class="link-item" title="\${link.description || link.name}"><i class="\${iconClass} link-icon"></i><span class="link-name">\${link.name}</span></a>\`;
  }
  
  // --- Search ---
  function searchGoogle(event) { event.preventDefault(); const q = event.target.querySelector('input').value.trim(); if(q) window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank'); event.target.reset(); }
  function searchBaidu(event) { event.preventDefault(); const q = event.target.querySelector('input').value.trim(); if(q) window.open('https://www.baidu.com/s?wd=' + encodeURIComponent(q), '_blank'); event.target.reset(); }
  
  // --- Modals & Panels ---
  function openModal(id) { document.getElementById(id).classList.add('show'); }
  function closeModal(id) { document.getElementById(id).classList.remove('show'); }
  function openAdminModal() { if (isAdmin) { openAdminPanel(); loadAdminData(); } else { openModal('loginModal'); } }
  function openGuestModal() { openModal('guestModal'); }
  function openAdminPanel() { document.getElementById('adminPanel').classList.add('open'); }
  function closeAdminPanel() { document.getElementById('adminPanel').classList.remove('open'); }
  
  // --- Authentication ---
  async function adminLogin(e) {
      e.preventDefault();
      const creds = Object.fromEntries(new FormData(e.target).entries());
      try {
          const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
          const data = await res.json();
          if (data.success) {
              currentUser = { username: creds.username, role: data.role, token: data.token };
              isAdmin = true;
              closeModal('loginModal');
              openAdminPanel();
              await loadSiteConfig();
              loadAdminData();
              loadCategories();
              showNotification('管理员登录成功', 'success');
          } else { showNotification(data.message, 'error'); }
      } catch { showNotification('登录失败', 'error'); }
  }
  
  async function guestLogin(e) {
      e.preventDefault();
      const creds = Object.fromEntries(new FormData(e.target).entries());
      try {
          const res = await fetch('/api/guest-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(creds) });
          const data = await res.json();
          if (data.success) {
              currentUser = { username: creds.username, role: data.role, token: data.token };
              closeModal('guestModal');
              await loadCategories();
              showNotification('访客验证成功', 'success');
          } else { showNotification(data.message, 'error'); }
      } catch { showNotification('验证失败', 'error'); }
  }
  
  function logout() { currentUser = null; isAdmin = false; closeAdminPanel(); loadCategories(); showNotification('已退出登录', 'success'); }
  
  // --- Admin Functions ---
  function loadAdminData() {
      document.getElementById('editTitle').value = siteConfig.title || '';
      document.getElementById('editSubtitle').value = siteConfig.chineseTitle || '';
      renderBackgroundManager();
      renderCategoryManager();
  }
  
  async function updateSiteConfig() {
      const newConfig = { title: document.getElementById('editTitle').value, chineseTitle: document.getElementById('editSubtitle').value };
      try {
          const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentUser.token }, body: JSON.stringify(newConfig) });
          if (res.ok) { 
              siteConfig.title = newConfig.title;
              siteConfig.chineseTitle = newConfig.chineseTitle;
              loadSiteConfig(); 
              showNotification('网站设置已更新', 'success'); 
          } else { showNotification('更新失败', 'error'); }
      } catch { showNotification('更新失败', 'error'); }
  }
  
  function renderBackgroundManager() {
      const container = document.getElementById('bg-manager');
      container.innerHTML = (siteConfig.backgroundImageUrls || []).map((url, index) => \`
          <div class="bg-thumbnail">
              <img src="\${url}" alt="Background \${index + 1}">
              <button class="bg-delete-btn" onclick="deleteBackground(\${index})">&times;</button>
          </div>
      \`).join('');
  }
  
  // --- Category Management ---
  function renderCategoryManager() {
      const manager = document.getElementById('categoryManager');
      manager.innerHTML = '';
      const sorted = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
      sorted.forEach(cat => {
          const el = document.createElement('div');
          el.className = 'category-item';
          el.setAttribute('draggable', 'true');
          el.dataset.id = cat.id;
          el.innerHTML = \`<div class="category-header"><span class="drag-handle"><i class="fas fa-grip-vertical"></i></span><strong>\${cat.name}</strong><div class="category-controls"><button class="icon-btn" onclick="editCategory('\${cat.id}')" title="编辑"><i class="fas fa-edit"></i></button><button class="icon-btn" onclick="deleteCategory('\${cat.id}')" title="删除"><i class="fas fa-trash"></i></button></div></div><div style="font-size: 12px; opacity: 0.8; padding-left: 24px;">\${(cat.links || []).length}个链接, \${(cat.subcategories || []).length}个子分类 \${cat.isPrivate ? '• 私密' : ''}</div>\`;
          manager.appendChild(el);
      });
      setupDragAndDrop(manager, categories, updateCategories);
  }
  
  function addNewCategory() {
      const name = prompt("请输入新分类的名称:");
      if (name) {
          categories.push({ id: 'cat_' + Date.now(), name, icon: 'folder', isPrivate: false, order: categories.length + 1, subcategories: [], links: [] });
          updateCategories();
      }
  }
  
  function deleteCategory(id) {
      if (confirm('确定要删除这个分类及其所有内容吗？')) {
          categories = categories.filter(c => c.id !== id);
          updateCategories();
      }
  }
  
  async function updateCategories() {
      categories.forEach((cat, index) => { cat.order = index + 1; });
      try {
          const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + currentUser.token }, body: JSON.stringify(categories) });
          if (res.ok) { renderCategories(); renderCategoryManager(); showNotification('分类已更新', 'success'); } else { showNotification('更新失败', 'error'); }
      } catch (e) { showNotification('更新失败: ' + e.message, 'error'); }
  }
  
  // --- Notification ---
  function showNotification(message, type = 'success') {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      notification.className = 'notification ' + type;
      notification.classList.add('show');
      setTimeout(() => { notification.classList.remove('show'); }, 3000);
  }
  
  // --- Category Editor ---
  function editCategory(id) {
      editingCategoryId = id;
      const category = categories.find(c => c.id === editingCategoryId);
      if (!category) return;
      document.getElementById('editCategoryTitle').textContent = \`编辑: \${category.name}\`;
      const container = document.getElementById('editCategoryFormContainer');
      container.innerHTML = \`<div class="form-group"><label class="form-label">分类名称</label><input type="text" class="form-input" id="editCatNameInput" value="\${category.name}"></div><div class="form-group"><label class="form-label">图标 (Font Awesome)</label><input type="text" class="form-input" id="editCatIconInput" value="\${category.icon || 'folder'}" placeholder="如: globe, robot, tools"></div><div class="form-group"><label class="form-label" style="display: flex; align-items: center;"><input type="checkbox" id="editCatPrivateInput" \${category.isPrivate ? 'checked' : ''} style="margin-right: 10px;">设为私密</label></div><hr style="border-color: rgba(255,255,255,0.2); margin: 20px 0;"><h4>主分类链接</h4><div id="linksEditorContainer-main"></div><button class="btn btn-secondary" onclick="addLinkToEditor()"><i class="fas fa-plus"></i> 添加链接</button><hr style="border-color: rgba(255,255,255,0.2); margin: 20px 0;"><h4>二级分类</h4><div id="subcategoriesEditorContainer"></div><button class="btn btn-secondary" onclick="addSubcategoryToEditor()"><i class="fas fa-plus"></i> 添加二级分类</button>\`;
      renderLinksEditor();
      renderSubcategoriesEditor();
      openModal('editCategoryModal');
  }
  
  function renderLinksEditor(subcategoryId) {
      const isMain = !subcategoryId;
      const containerId = isMain ? 'linksEditorContainer-main' : \`linksEditorContainer-\${subcategoryId}\`;
      const container = document.getElementById(containerId);
      container.innerHTML = '';
      const category = categories.find(c => c.id === editingCategoryId);
      let linkSource = isMain ? category : category.subcategories.find(s => s.id === subcategoryId);
      if (!linkSource.links) linkSource.links = [];
      linkSource.links.forEach(link => {
          const el = document.createElement('div');
          el.className = 'draggable-item';
          el.setAttribute('draggable', 'true');
          el.dataset.id = link.id;
          el.innerHTML = \`<span class="drag-handle"><i class="fas fa-grip-vertical"></i></span><div style="flex-grow:1"><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;"><input type="text" class="form-input" data-field="name" placeholder="名称" value="\${link.name || ''}"><input type="text" class="form-input" data-field="url" placeholder="URL" value="\${link.url || ''}"></div><input type="text" class="form-input" data-field="icon" placeholder="图标 (如: fab fa-google)" value="\${link.icon || ''}" style="margin-bottom: 10px;"><textarea class="form-textarea" data-field="description" placeholder="描述" style="height: 60px;">\${link.description || ''}</textarea></div><button class="icon-btn" onclick="deleteLinkFromEditor('\${link.id}', '\${subcategoryId || ''}')" style="margin-left:10px; align-self:center;"><i class="fas fa-trash"></i></button>\`;
          el.style.display = 'flex';
          el.style.alignItems = 'flex-start';
          container.appendChild(el);
      });
      setupDragAndDrop(container, linkSource.links);
  }
  
  function renderSubcategoriesEditor() {
      const category = categories.find(c => c.id === editingCategoryId);
      const container = document.getElementById('subcategoriesEditorContainer');
      container.innerHTML = (category.subcategories || []).map(sub => \`<div class="category-item" style="background: rgba(255,255,255,0.05);"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"><input type="text" class="form-input" data-sub-field="name" data-sub-id="\${sub.id}" value="\${sub.name}" style="flex: 1; margin-right: 10px;"><button class="icon-btn" onclick="deleteSubcategoryFromEditor('\${sub.id}')"><i class="fas fa-trash"></i></button></div><div class="form-group"><label class="form-label" style="display: flex; align-items: center; font-size: 14px;"><input type="checkbox" data-sub-field="isPrivate" data-sub-id="\${sub.id}" \${sub.isPrivate ? 'checked' : ''} style="margin-right: 10px;">设为私密</label></div><div id="linksEditorContainer-\${sub.id}"></div><button class="btn btn-secondary" onclick="addLinkToEditor('\${sub.id}')"><i class="fas fa-plus"></i> 添加链接到此分类</button></div>\`).join('');
      (category.subcategories || []).forEach(sub => renderLinksEditor(sub.id));
  }
  
  function addLinkToEditor(subcategoryId) {
      const category = categories.find(c => c.id === editingCategoryId);
      let linkSource = subcategoryId ? category.subcategories.find(s => s.id === subcategoryId) : category;
      if (!linkSource.links) linkSource.links = [];
      linkSource.links.push({ id: 'link_' + Date.now(), name: '', url: '', icon: '', description: '' });
      renderLinksEditor(subcategoryId);
  }
  
  function deleteLinkFromEditor(linkId, subcategoryId) {
      const category = categories.find(c => c.id === editingCategoryId);
      let linkSource = subcategoryId ? category.subcategories.find(s => s.id === subcategoryId) : category;
      linkSource.links = linkSource.links.filter(l => l.id !== linkId);
      renderLinksEditor(subcategoryId);
  }
  
  function addSubcategoryToEditor() {
      const category = categories.find(c => c.id === editingCategoryId);
      const name = prompt("请输入新二级分类的名称:");
      if (name) {
          if (!category.subcategories) category.subcategories = [];
          category.subcategories.push({ id: 'sub_' + Date.now(), name, isPrivate: false, links: [] });
          renderSubcategoriesEditor();
      }
  }
  
  function deleteSubcategoryFromEditor(subcategoryId) {
      if (!confirm('确定删除此二级分类及其所有链接吗?')) return;
      const category = categories.find(c => c.id === editingCategoryId);
      category.subcategories = category.subcategories.filter(s => s.id !== subcategoryId);
      renderSubcategoriesEditor();
  }
  
  function saveCategoryChanges() {
      const category = categories.find(c => c.id === editingCategoryId);
      category.name = document.getElementById('editCatNameInput').value;
      category.icon = document.getElementById('editCatIconInput').value;
      category.isPrivate = document.getElementById('editCatPrivateInput').checked;
      
      const getLinksFromContainer = (container) => Array.from(container.querySelectorAll('.draggable-item')).map(item => ({
          id: item.dataset.id,
          name: item.querySelector('[data-field="name"]').value,
          url: item.querySelector('[data-field="url"]').value,
          icon: item.querySelector('[data-field="icon"]').value,
          description: item.querySelector('[data-field="description"]').value,
      }));
      category.links = getLinksFromContainer(document.getElementById('linksEditorContainer-main'));
      
      category.subcategories = Array.from(document.getElementById('subcategoriesEditorContainer').querySelectorAll('.category-item')).map(subContainer => {
          const subId = subContainer.querySelector('[data-sub-field="name"]').dataset.subId;
          return {
              id: subId,
              name: subContainer.querySelector('[data-sub-field="name"]').value,
              isPrivate: subContainer.querySelector('[data-sub-field="isPrivate"]').checked,
              links: getLinksFromContainer(subContainer.querySelector(\`#linksEditorContainer-\${subId}\`))
          };
      });
      closeModal('editCategoryModal');
      updateCategories();
  }
  
  // --- Drag and Drop ---
  function setupDragAndDrop(container, list, onUpdateCallback) {
      let draggingElement = null;
      container.addEventListener('dragstart', e => {
          if(!e.target.classList.contains('draggable-item') && !e.target.classList.contains('category-item')) return;
          draggingElement = e.target;
          setTimeout(() => e.target.classList.add('dragging'), 0);
      });
      container.addEventListener('dragend', e => {
          if (!draggingElement) return;
          draggingElement.classList.remove('dragging');
          draggingElement = null;
          
          const newIdsOrder = [...container.children].map(el => el.dataset.id);
          list.sort((a, b) => newIdsOrder.indexOf(a.id) - newIdsOrder.indexOf(b.id));
  
          if(onUpdateCallback) {
              onUpdateCallback();
          }
      });
      container.addEventListener('dragover', e => {
          e.preventDefault();
          const afterElement = getDragAfterElement(container, e.clientY);
          if (afterElement == null) {
              container.appendChild(draggingElement);
          } else {
              container.insertBefore(draggingElement, afterElement);
          }
      });
  }
  
  function getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];
      return draggableElements.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) {
              return { offset: offset, element: child };
          } else {
              return closest;
          }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  
  // --- Global Event Listeners ---
  window.onclick = (event) => { if (event.target.classList.contains('modal')) event.target.classList.remove('show'); };
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show')); if (document.getElementById('adminPanel').classList.contains('open')) closeAdminPanel(); } });
  </script>
  </body>
  </html>`;
  }
  