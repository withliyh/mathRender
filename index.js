/**
 * 数学公式渲染服务 - 主入口文件
 * 使用LaTeX渲染器提供公式渲染API接口
 */
const express = require('express');
const path = require('path');
const latexRenderer = require('./latex-renderer');

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件配置
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 统一的渲染处理函数
 */
async function handleRender(req, res) {
    try {
        const params = req.method === 'GET' ? req.query : req.body;
        const { formula, ...options } = params;

        if (!formula) {
            return res.status(400).json({ error: '缺少公式参数' });
        }

        const result = await latexRenderer.renderLatex(formula, options);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
        return res.send(result.content);

    } catch (error) {
        console.error('渲染错误:', error);

        const errorResponse = {
            error: error.message || '渲染失败',
            taskId: error.taskId || '未知'
        };

        res.status(500).json(errorResponse);
    }
}

// API路由
app.get('/api/render', handleRender);
app.post('/api/render', handleRender);
app.get('/api/render-complex', handleRender); // 向后兼容
app.post('/api/render-complex', handleRender); // 向后兼容

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/complex.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'complex.html'));
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 数学公式渲染服务已启动`);
    console.log(`✅ 服务正在监听: 0.0.0.0:${port}`);
    console.log(`📍 本地访问: http://localhost:${port}`);
    console.log(`LAN 访问: (请使用您的内网IP)`);
    console.log(`📊 健康检查: http://localhost:${port}/health`);
});