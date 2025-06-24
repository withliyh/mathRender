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
        backgroundColor: options.backgroundColor === undefined ? 'transparent' : options.backgroundColor,
        fontSize: options.fontSize ? parseInt(options.fontSize) : null,

        // 布局设置
        display: options.display === 'false' ? false : (options.display === 'true' || options.display === true || options.display === undefined),
        width: options.width ? parseInt(options.width) : null,
        height: options.height ? parseInt(options.height) : null,
        padding: parseInt(options.padding) || 0, // 默认无边框
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

    // 根据背景设置决定是否添加背景色
    const isTransparent = options.backgroundColor === 'transparent';
    const backgroundSetup = isTransparent ?
        '' :  // 透明背景时不设置任何背景色，让standalone默认处理
        (options.backgroundColor ? `\\pagecolor{${options.backgroundColor}}` : '');

    console.log(`📄 背景设置: ${isTransparent ? '透明(默认)' : options.backgroundColor || '默认'}`);
    console.log(`🎨 字体颜色: ${options.color}`);

    // 处理颜色命令
    let colorCommand = '';
    if (options.color) {
        // 检查是否为十六进制颜色
        if (options.color.startsWith('#')) {
            const hexColor = options.color.substring(1);
            // 使用xcolor的HTML模型，避免'#'字符问题
            colorCommand = `\\color[HTML]{${hexColor}}`;
        } else {
            // 否则视为预定义颜色名称
            colorCommand = `\\color{${options.color}}`;
        }
    }

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
${backgroundSetup}
\\begin{document}
{${colorCommand} ${safeFormula}}
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
 * 获取PDF文件的尺寸信息（单位：点）
 * @param {string} pdfPath - PDF文件路径
 * @returns {Promise<{width: number, height: number}>} PDF尺寸
 */
async function getPdfDimensions(pdfPath) {
    try {
        console.log(`📏 正在获取PDF尺寸: ${pdfPath}`);

        // 修正pdftocairo命令，添加必要的输出格式参数
        const result = await executeCommand(CONFIG.pdftocairoPath, [
            '-png',
            '-singlefile',
            '-r', '1',  // 使用1 DPI来避免实际转换，只获取信息
            path.basename(pdfPath)
        ], {
            cwd: CONFIG.baseDir
        });

        console.log(`📏 pdftocairo输出:`, result.stdout);
        console.log(`📏 pdftocairo错误:`, result.stderr);

        // 尝试从stderr中解析PDF尺寸信息
        // pdftocairo通常会在stderr中输出页面信息
        const sizeMatch = result.stderr.match(/Page.*?(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*pts/) ||
            result.stdout.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*pts/);

        if (sizeMatch) {
            const dimensions = {
                width: parseFloat(sizeMatch[1]),
                height: parseFloat(sizeMatch[2])
            };
            console.log(`📏 解析到PDF尺寸: ${dimensions.width} x ${dimensions.height} 点`);

            // 清理可能生成的1DPI图片
            const lowResPng = path.join(CONFIG.baseDir, path.basename(pdfPath, '.pdf') + '.png');
            try {
                if (await fileExists(lowResPng)) {
                    await fs.unlink(lowResPng);
                }
            } catch { }

            return dimensions;
        }

        throw new Error('无法从pdftocairo输出中解析PDF尺寸信息');
    } catch (error) {
        console.log(`⚠️ 无法获取PDF尺寸，将使用备用方法: ${error.message}`);

        // 备用方法：使用ImageMagick直接分析PDF
        if (await checkImageMagickAvailable()) {
            try {
                console.log(`📏 备用方法：使用ImageMagick直接分析PDF`);
                const identifyResult = await executeCommand(CONFIG.imageMagickPath, [
                    'identify', '-format', '%w %h', path.basename(pdfPath)
                ], {
                    cwd: CONFIG.baseDir
                });

                console.log(`📏 ImageMagick identify PDF输出: ${identifyResult.stdout}`);

                const [width, height] = identifyResult.stdout.trim().split(' ').map(Number);
                console.log(`📏 PDF内在尺寸: ${width} x ${height} 点`);

                return { width, height };
            } catch (identifyError) {
                console.log(`⚠️ ImageMagick分析PDF也失败: ${identifyError.message}`);
            }
        }

        // 最后的备用方法：通过PNG估算（修正计算方式）
        console.log(`📏 最终备用方法：通过PNG估算尺寸`);
        const tempTaskId = `temp_${Date.now()}`;
        const tempPng = await convertPdfToPng(tempTaskId, pdfPath, 72, {});

        if (await checkImageMagickAvailable()) {
            try {
                const pngFileName = await findGeneratedPngFile(tempTaskId);
                console.log(`📏 查找生成的PNG文件: ${pngFileName}`);

                const identifyResult = await executeCommand(CONFIG.imageMagickPath, [
                    'identify', '-format', '%w %h', pngFileName
                ], {
                    cwd: CONFIG.baseDir
                });

                console.log(`📏 ImageMagick identify PNG输出: ${identifyResult.stdout}`);

                const [pngWidth, pngHeight] = identifyResult.stdout.trim().split(' ').map(Number);
                console.log(`📏 PNG尺寸: ${pngWidth} x ${pngHeight} 像素 (72 DPI)`);

                // 正确的转换：72 DPI下，像素转点的公式是：点 = 像素 * 72 / DPI
                // 由于我们用的是72 DPI，所以：点 = 像素 * 72 / 72 = 像素
                // 但这不对！应该是：点 = 像素 / (DPI/72) = 像素 * 72 / DPI
                // 在72 DPI下：点 = 像素
                const dimensions = {
                    width: pngWidth,
                    height: pngHeight
                };
                console.log(`📏 转换为PDF点数: ${dimensions.width} x ${dimensions.height} 点`);

                // 清理临时文件
                await cleanupFiles(tempTaskId);

                return dimensions;
            } catch (identifyError) {
                console.log(`⚠️ PNG估算方法也失败: ${identifyError.message}`);
            }
        }

        // 最后的fallback：返回合理的估算值
        console.log(`📏 使用fallback默认值: 100 x 30 点`);
        return { width: 100, height: 30 };
    }
}

/**
 * 查找生成的PNG文件名
 */
async function findGeneratedPngFile(taskId) {
    const possibleFiles = [
        `${taskId}-1.png`,
        `${taskId}.png`
    ];

    for (const fileName of possibleFiles) {
        const filePath = path.join(CONFIG.baseDir, fileName);
        if (await fileExists(filePath)) {
            console.log(`📏 找到PNG文件: ${fileName}`);
            return fileName;
        }
    }

    throw new Error(`未找到任何PNG文件: ${possibleFiles.join(', ')}`);
}

/**
 * 计算最优DPI
 * @param {Object} actualSize - 实际PDF尺寸（点）
 * @param {Object} targetSize - 目标像素尺寸
 * @param {number} baseDpi - 第一步渲染使用的DPI（这里不需要用到）
 * @returns {number} 最优DPI值
 */
function calculateOptimalDPI(actualSize, targetSize, baseDpi = 300) {
    console.log(`🔢 开始DPI计算:`);
    console.log(`🔢 - 实际PDF尺寸: ${actualSize.width} x ${actualSize.height} 点`);
    console.log(`🔢 - 目标像素尺寸: ${targetSize.width || 'auto'} x ${targetSize.height || 'auto'} 像素`);
    console.log(`🔢 - 基准DPI: ${baseDpi}`);

    if (!targetSize.width && !targetSize.height) {
        console.log(`🔢 无目标尺寸，返回基准DPI: ${baseDpi}`);
        return baseDpi;
    }

    let dpiX = baseDpi;
    let dpiY = baseDpi;

    // 正确的DPI计算公式
    // DPI = (目标像素 * 72) / PDF点数
    // 这是最直接的转换公式：点转像素 = 点 * DPI / 72
    if (targetSize.width && actualSize.width > 0) {
        dpiX = (targetSize.width * 72) / actualSize.width;
        console.log(`🔢 X轴计算: (${targetSize.width} * 72) / ${actualSize.width} = ${dpiX.toFixed(2)}`);
    }

    if (targetSize.height && actualSize.height > 0) {
        dpiY = (targetSize.height * 72) / actualSize.height;
        console.log(`🔢 Y轴计算: (${targetSize.height} * 72) / ${actualSize.height} = ${dpiY.toFixed(2)}`);
    }

    // 如果同时指定了宽高，选择较小的DPI以确保图片不超出任何一个维度
    let optimalDpi;
    if (targetSize.width && targetSize.height) {
        optimalDpi = Math.min(dpiX, dpiY);
        console.log(`🔢 同时指定宽高，选择较小值: min(${dpiX.toFixed(1)}, ${dpiY.toFixed(1)}) = ${optimalDpi.toFixed(1)}`);
    } else {
        optimalDpi = targetSize.width ? dpiX : dpiY;
        console.log(`🔢 单向约束，使用: ${optimalDpi.toFixed(1)}`);
    }

    // 放宽DPI限制，允许更高的DPI以支持大尺寸输出
    const originalOptimalDpi = optimalDpi;
    optimalDpi = Math.max(50, Math.min(2400, optimalDpi)); // 从1200提高到2400

    if (originalOptimalDpi !== optimalDpi) {
        console.log(`🔢 DPI限制: ${originalOptimalDpi.toFixed(1)} -> ${optimalDpi.toFixed(1)} (范围: 50-2400)`);
    }

    console.log(`🎯 最终DPI: ${optimalDpi.toFixed(1)}`);
    console.log(`📐 验证计算:`);
    if (targetSize.width) {
        const resultWidth = (actualSize.width * optimalDpi / 72);
        console.log(`📐 - 宽度: ${actualSize.width.toFixed(1)}点 * ${optimalDpi.toFixed(1)}DPI / 72 = ${resultWidth.toFixed(1)}像素 (目标: ${targetSize.width})`);
    }
    if (targetSize.height) {
        const resultHeight = (actualSize.height * optimalDpi / 72);
        console.log(`📐 - 高度: ${actualSize.height.toFixed(1)}点 * ${optimalDpi.toFixed(1)}DPI / 72 = ${resultHeight.toFixed(1)}像素 (目标: ${targetSize.height})`);
    }

    return Math.round(optimalDpi);
}

/**
 * 转换PDF为PNG
 */
async function convertPdfToPng(taskId, pdfPath, dpi = 300, options = {}) {
    const { width = null, height = null, padding = 0, scale = 1, backgroundColor = 'transparent' } = options;
    const pdfFilename = path.basename(pdfPath);

    console.log(`🖼️ 开始PDF转PNG:`);
    console.log(`🖼️ - 任务ID: ${taskId}`);
    console.log(`🖼️ - PDF文件: ${pdfFilename}`);
    console.log(`🖼️ - DPI: ${dpi}`);
    console.log(`🖼️ - 选项: width=${width}, height=${height}, padding=${padding}, scale=${scale}, backgroundColor=${backgroundColor}`);

    let adjustedDpi = dpi;
    if (scale !== 1) {
        adjustedDpi = Math.round(dpi * scale);
        console.log(`🖼️ - 调整后DPI (scale=${scale}): ${adjustedDpi}`);
    }

    // 检查pdftocairo是否可用
    try {
        await fs.access(CONFIG.pdftocairoPath);
        console.log(`✅ pdftocairo可用: ${CONFIG.pdftocairoPath}`);
    } catch (error) {
        throw new Error(`pdftocairo未找到，请确认TeX Live已正确安装在: ${CONFIG.pdftocairoPath}`);
    }

    // 构建pdftocairo命令参数
    const pngBaseFilename = taskId;
    const pdftocairoArgs = ['-png', '-r', `${adjustedDpi}`];

    // 如果需要透明背景，添加透明参数
    if (backgroundColor === 'transparent') {
        pdftocairoArgs.push('-transp');
        console.log(`🖼️ 启用透明背景模式`);
    }

    pdftocairoArgs.push(pdfFilename, pngBaseFilename);

    console.log(`🖼️ 执行pdftocairo: ${pdftocairoArgs.join(' ')}`);

    await executeCommand(CONFIG.pdftocairoPath, pdftocairoArgs, {
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
            console.log(`🖼️ 找到生成的PNG: ${path.basename(pngPath)}`);
            break;
        }
    }

    if (!sourcePngPath) {
        console.error(`🖼️ 未找到任何PNG文件:`);
        for (const pngPath of possiblePngFiles) {
            console.error(`🖼️ - 检查: ${pngPath}`);
        }
        throw new Error('PNG文件未生成');
    }

    // 使用ImageMagick获取实际生成的图片尺寸
    if (await checkImageMagickAvailable()) {
        try {
            const identifyResult = await executeCommand(CONFIG.imageMagickPath, [
                'identify', '-format', '%w %h', path.basename(sourcePngPath)
            ], {
                cwd: CONFIG.baseDir
            });

            const [actualWidth, actualHeight] = identifyResult.stdout.trim().split(' ').map(Number);
            console.log(`🖼️ 实际生成的PNG尺寸: ${actualWidth} x ${actualHeight} 像素`);
        } catch (identifyError) {
            console.log(`🖼️ 无法获取PNG尺寸: ${identifyError.message}`);
        }
    }

    let finalPngPath = sourcePngPath;

    // 检查是否需要后处理
    const needsPostProcessing = width || height || padding > 0;

    if (needsPostProcessing) {
        console.log(`🖼️ 需要后处理: width=${width}, height=${height}, padding=${padding}`);
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
    } else {
        console.log(`🖼️ 跳过后处理`);
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
 * 两步渲染法：精确控制输出尺寸
 * @param {string} taskId - 任务ID
 * @param {string} texContent - LaTeX内容
 * @param {Object} options - 渲染选项
 * @returns {Promise<Buffer>} PNG图片数据
 */
async function renderWithPreciseSize(taskId, texContent, options) {
    const { width, height, dpi: requestedDpi = 300 } = options;

    // 如果没有指定尺寸，使用传统单步渲染
    if (!width && !height) {
        console.log(`📐 使用传统渲染 (DPI: ${requestedDpi})`);
        const pdfPath = await compileWithXeLaTeX(taskId, texContent);
        return await convertPdfToPng(taskId, pdfPath, requestedDpi, options);
    }

    console.log(`📐 使用两步渲染法，目标尺寸: ${width || 'auto'}x${height || 'auto'}`);

    // 第一步：使用默认DPI渲染，获取实际尺寸
    console.log(`📐 第一步：获取实际尺寸 (DPI: ${requestedDpi})`);
    const firstTaskId = `${taskId}_step1`;
    const pdfPath = await compileWithXeLaTeX(firstTaskId, texContent);
    const actualSize = await getPdfDimensions(pdfPath);

    console.log(`📏 实际PDF尺寸: ${actualSize.width.toFixed(1)} x ${actualSize.height.toFixed(1)} 点`);

    // 第二步：计算最优DPI并重新渲染
    const optimalDpi = calculateOptimalDPI(actualSize, { width, height }, requestedDpi);

    console.log(`📐 第二步：精确渲染 (DPI: ${optimalDpi})`);
    const secondTaskId = `${taskId}_step2`;
    const finalPdfPath = await compileWithXeLaTeX(secondTaskId, texContent);
    const finalPng = await convertPdfToPng(secondTaskId, finalPdfPath, optimalDpi, {
        ...options,
        // 禁用ImageMagick的强制resize，因为我们已经通过DPI精确控制了
        width: null,
        height: null
    });

    // 清理第一步的临时文件
    await cleanupFiles(firstTaskId);
    await cleanupFiles(secondTaskId);

    return finalPng;
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

        // 2. 根据是否需要精确尺寸控制选择渲染方法
        let png;
        if (normalizedOptions.width || normalizedOptions.height) {
            png = await renderWithPreciseSize(taskId, texContent, normalizedOptions);
        } else {
            // 传统渲染方法
            const pdfPath = await compileWithXeLaTeX(taskId, texContent);
            png = await convertPdfToPng(taskId, pdfPath, normalizedOptions.dpi, normalizedOptions);
        }

        console.log(`✅ 渲染成功: ${taskId}`);

        // 3. 清理临时文件
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
