const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { parseFormula, processFormula } = require('./formula-parser');

// 配置
const CONFIG = {
    baseDir: 'C:/textemp',
    // Windows平台上XeLaTeX的绝对路径
    xelatexPath: 'C:/texlive/2025/bin/windows/xelatex.exe',
    pdftocairoPath: 'C:/texlive/2025/bin/windows/pdftocairo.exe',
    // ImageMagick的绝对路径
    imageMagickPath: 'C:/Program Files/ImageMagick-7.1.1-Q16/magick.exe',
    formats: {
        png: {
            contentType: 'image/png',
            extension: '.png'
        }
    }
};

/**
 * 标准化渲染选项
 * @param {Object} options - 原始选项
 * @returns {Object} 标准化后的选项
 */
function normalizeOptions(options = {}) {
    const normalized = {
        // 输出格式
        format: 'png',
        dpi: parseInt(options.dpi) || 300,

        // 外观设置
        color: options.color || 'black',
        backgroundColor: options.backgroundColor === 'transparent' ? 'transparent' : options.backgroundColor,
        fontSize: options.fontSize ? parseInt(options.fontSize) : null,

        // 布局设置
        display: options.display === 'false' ? false : (options.display === 'true' || options.display === true || options.display === undefined),
        width: options.width ? parseInt(options.width) : null,
        height: options.height ? parseInt(options.height) : null,
        padding: parseInt(options.padding) || 5,
        scale: parseFloat(options.scale) || 1
    };

    return normalized;
}

/**
 * 生成XeLaTeX文档
 * @param {string} formula - 公式字符串
 * @param {Object} options - 渲染选项
 * @returns {string} 完整的XeLaTeX文档
 */
function createXeLaTeXDocument(formula, options) {
    console.log(`📄 使用原始公式：直接输出到文档`);

    // 直接使用原始公式，只做基本的安全转义（如果需要的话）
    const safeFormula = formula; // 保持原样，LaTeX应该能正确解析

    // 生成XeLaTeX文档 - 支持Unicode和中文
    const document = `\\documentclass[border=2pt,varwidth]{standalone}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{xcolor}
\\usepackage[version=4]{mhchem}
\\usepackage{chemfig}
\\usepackage{chemmacros}
\\usepackage{fontspec}
\\usepackage{xeCJK}
\\setCJKmainfont{SimSun}
\\setmainfont{Latin Modern Roman}
\\begin{document}
${safeFormula}
\\end{document}`;

    console.log(`📄 生成的文档内容: ${safeFormula}`);
    return document;
}

/**
 * 确保工作目录存在
 */
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`✓ 目录已确认: ${dir}`);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw new Error(`创建目录失败: ${err.message}`);
        }
    }
}

/**
 * 生成唯一文件ID
 */
function generateTaskId() {
    return crypto.randomBytes(8).toString('hex') + '-' + Date.now();
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 执行外部命令
 */
function executeCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, options);
        let stdout = '';
        let stderr = '';

        if (process.stdout) {
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }

        if (process.stderr) {
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
        }

        process.on('close', (code) => {
            if (code === 0 || (stderr.includes('security risk') && stdout.includes('Output written on'))) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });

        process.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * 检查XeLaTeX是否可用
 */
async function checkXeLaTeXAvailable() {
    try {
        const fs = require('fs').promises;
        await fs.access(CONFIG.xelatexPath);
        console.log(`✅ XeLaTeX可用: ${CONFIG.xelatexPath}`);
        return true;
    } catch (error) {
        console.error(`❌ XeLaTeX不可用: ${CONFIG.xelatexPath}`);
        return false;
    }
}

/**
 * 使用XeLaTeX编译为PDF
 */
async function compileWithXeLaTeX(taskId, texContent) {
    await ensureDir(CONFIG.baseDir);

    // 检查XeLaTeX是否可用
    const isXeLaTeXAvailable = await checkXeLaTeXAvailable();
    if (!isXeLaTeXAvailable) {
        throw new Error(`XeLaTeX未找到，请确认TeX Live已正确安装在: ${CONFIG.xelatexPath}`);
    }

    const texFilename = `${taskId}.tex`;
    const texFilePath = path.join(CONFIG.baseDir, texFilename);
    const pdfFilePath = path.join(CONFIG.baseDir, `${taskId}.pdf`);

    await fs.writeFile(texFilePath, texContent);

    // 使用绝对路径调用XeLaTeX
    const xelatexArgs = [
        '-interaction=nonstopmode',
        '-file-line-error',
        texFilename
    ];

    try {
        console.log(`🔧 使用XeLaTeX编译: ${CONFIG.xelatexPath}`);

        // 只编译一次，XeLaTeX通常不需要多次编译
        await executeCommand(CONFIG.xelatexPath, xelatexArgs, {
            cwd: CONFIG.baseDir
        });

    } catch (error) {
        // 读取日志获取错误信息
        const logFilePath = path.join(CONFIG.baseDir, `${taskId}.log`);
        try {
            const logContent = await fs.readFile(logFilePath, 'utf8');

            // 只在调试时输出完整日志
            if (process.env.NODE_ENV === 'development') {
                console.log(`📋 XeLaTeX编译日志:`);
                console.log(logContent);
            }

            // 提取关键错误信息
            const errorLines = logContent.split('\n')
                .filter(line => line.includes('!') || line.includes('Error') || line.includes('Missing') || line.includes('not found'))
                .slice(-5)
                .join('\n');

            if (errorLines) {
                throw new Error(`XeLaTeX编译错误:\n${errorLines}`);
            }
        } catch (logErr) {
            console.log(`⚠️ 无法读取日志文件: ${logErr.message}`);
        }

        throw error;
    }

    if (await fileExists(pdfFilePath)) {
        const stats = await fs.stat(pdfFilePath);
        console.log(`✅ XeLaTeX编译成功 (${stats.size} bytes)`);
        return pdfFilePath;
    } else {
        throw new Error('PDF文件未生成');
    }
}

/**
 * 检查 ImageMagick 是否可用
 */
async function checkImageMagickAvailable() {
    try {
        await fs.access(CONFIG.imageMagickPath);
        console.log(`✅ ImageMagick可用: ${CONFIG.imageMagickPath}`);
        return true;
    } catch (error) {
        console.log(`⚠️ ImageMagick未找到: ${CONFIG.imageMagickPath}`);
        return false;
    }
}

/**
 * 转换PDF为PNG
 */
async function convertPdfToPng(taskId, pdfPath, dpi = 300, options = {}) {
    const { width = null, height = null, padding = 0, scale = 1 } = options;
    const pdfFilename = path.basename(pdfPath);

    let adjustedDpi = dpi;
    if (scale !== 1) {
        adjustedDpi = Math.round(dpi * scale);
    }

    // 检查pdftocairo是否可用
    try {
        await fs.access(CONFIG.pdftocairoPath);
        console.log(`✅ pdftocairo可用: ${CONFIG.pdftocairoPath}`);
    } catch (error) {
        throw new Error(`pdftocairo未找到，请确认TeX Live已正确安装在: ${CONFIG.pdftocairoPath}`);
    }

    // 使用绝对路径调用pdftocairo
    const pngBaseFilename = taskId;
    await executeCommand(CONFIG.pdftocairoPath, [
        '-png',
        '-r', `${adjustedDpi}`,
        pdfFilename,
        pngBaseFilename
    ], {
        cwd: CONFIG.baseDir
    });

    // 查找生成的PNG文件
    const possiblePngFiles = [
        path.join(CONFIG.baseDir, `${taskId}-1.png`),
        path.join(CONFIG.baseDir, `${taskId}.png`)
    ];

    let sourcePngPath = null;
    for (const pngPath of possiblePngFiles) {
        if (await fileExists(pngPath)) {
            sourcePngPath = pngPath;
            break;
        }
    }

    if (!sourcePngPath) {
        throw new Error('PNG文件未生成');
    }

    let finalPngPath = sourcePngPath;

    // 检查是否需要后处理
    const needsPostProcessing = width || height || padding > 0;

    if (needsPostProcessing) {
        // 检查 ImageMagick 是否可用
        const isImageMagickAvailable = await checkImageMagickAvailable();

        if (!isImageMagickAvailable) {
            console.log(`⚠️ ImageMagick 未安装，跳过后处理 (width: ${width}, height: ${height}, padding: ${padding})`);
            console.log(`💡 如需调整图片尺寸和边距，请确认 ImageMagick 已安装在: ${CONFIG.imageMagickPath}`);
            console.log(`💡 或从以下地址下载安装: https://imagemagick.org/script/download.php#windows`);
        } else {
            try {
                const outputFilename = `${taskId}_processed.png`;
                const outputPath = path.join(CONFIG.baseDir, outputFilename);
                const convertArgs = ['convert', path.basename(sourcePngPath)];

                // 先修剪空白边缘
                convertArgs.push('-trim', '+repage');

                // 处理尺寸调整
                if (width && !height) {
                    convertArgs.push('-resize', `${Math.round(width * scale)}x`);
                    console.log(`🔧 调整宽度为: ${Math.round(width * scale)}px`);
                } else if (!width && height) {
                    convertArgs.push('-resize', `x${Math.round(height * scale)}`);
                    console.log(`🔧 调整高度为: ${Math.round(height * scale)}px`);
                } else if (width && height) {
                    convertArgs.push('-resize', `${Math.round(width * scale)}x${Math.round(height * scale)}!`);
                    console.log(`🔧 调整尺寸为: ${Math.round(width * scale)}x${Math.round(height * scale)}px (强制)`);
                }

                // 处理内边距
                if (padding > 0) {
                    convertArgs.push('-bordercolor', 'transparent');
                    convertArgs.push('-border', `${padding}`);
                    console.log(`🔧 添加内边距: ${padding}px`);
                }

                convertArgs.push(outputFilename);

                // 使用绝对路径调用 ImageMagick
                await executeCommand(CONFIG.imageMagickPath, convertArgs, {
                    cwd: CONFIG.baseDir
                });

                if (await fileExists(outputPath)) {
                    finalPngPath = outputPath;
                    console.log(`✅ ImageMagick后处理完成`);
                }
            } catch (error) {
                console.log(`⚠️ ImageMagick后处理失败，使用原始图像: ${error.message}`);
                console.log(`💡 原始图像仍可正常使用，只是无法应用自定义尺寸和边距`);

                // 如果是路径问题，提供更详细的错误信息
                if (error.message.includes('ENOENT') || error.message.includes('spawn')) {
                    console.log(`🔍 请检查 ImageMagick 安装路径是否正确: ${CONFIG.imageMagickPath}`);
                    console.log(`🔍 可以尝试在命令提示符中运行: "${CONFIG.imageMagickPath}" -version`);
                }
            }
        }
    }

    const stats = await fs.stat(finalPngPath);
    const pngBuffer = await fs.readFile(finalPngPath);
    console.log(`✅ PNG生成完成 (${stats.size} bytes)`);

    return pngBuffer;
}

/**
 * 清理临时文件
 */
async function cleanupFiles(taskId) {
    const extensions = ['.tex', '.pdf', '.aux', '.log', '.xdv', '.fls', '.fdb_latexmk', '.png', '-1.png', '_processed.png'];

    for (const ext of extensions) {
        try {
            const filePath = path.join(CONFIG.baseDir, `${taskId}${ext}`);
            if (await fileExists(filePath)) {
                await fs.unlink(filePath);
            }
        } catch (err) {
            // 忽略清理错误
        }
    }
}

/**
 * 主渲染函数
 * @param {string} formula - LaTeX公式
 * @param {Object} options - 渲染选项
 * @returns {Promise<Object>} 渲染结果
 */
async function renderLatex(formula, options = {}) {
    const taskId = generateTaskId();
    const normalizedOptions = normalizeOptions(options);

    console.log(`🚀 渲染任务 ${taskId}: "${formula.substring(0, 50)}${formula.length > 50 ? '...' : ''}"`);

    try {
        // 1. 生成XeLaTeX文档
        const texContent = createXeLaTeXDocument(formula, normalizedOptions);

        // 2. 使用XeLaTeX编译为PDF
        const pdfPath = await compileWithXeLaTeX(taskId, texContent);

        // 3. 转换为PNG
        const png = await convertPdfToPng(taskId, pdfPath, normalizedOptions.dpi, {
            width: normalizedOptions.width,
            height: normalizedOptions.height,
            padding: normalizedOptions.padding,
            scale: normalizedOptions.scale
        });

        console.log(`✅ 渲染成功: ${taskId}`);

        // 4. 清理临时文件
        await cleanupFiles(taskId);

        return {
            content: png,
            contentType: CONFIG.formats.png.contentType
        };

    } catch (error) {
        console.error(`❌ 渲染失败 ${taskId}: ${error.message}`);
        console.log(`🔍 临时文件保留: ${CONFIG.baseDir}/${taskId}.*`);

        const enhancedError = new Error(`${error.message}\n\n调试信息：\n- 任务ID: ${taskId}\n- 公式: "${formula}"\n- 文件位置: ${CONFIG.baseDir}\n- XeLaTeX路径: ${CONFIG.xelatexPath}`);
        enhancedError.taskId = taskId;

        throw enhancedError;
    }
}

module.exports = {
    renderLatex,
    CONFIG
};
