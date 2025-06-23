/**
 * 公式解析器 - 简化版，严格控制输入格式
 */

/**
 * 公式类型枚举
 */
const FormulaType = {
    MATH: 'math',           // 纯数学公式
    CHEMISTRY: 'chemistry', // 化学公式
    MIXED: 'mixed'          // 混合类型
};

/**
 * 数学环境标识符
 */
const MATH_ENVIRONMENTS = [
    'equation', 'align', 'gather', 'multline', 'split',
    'matrix', 'bmatrix', 'pmatrix', 'vmatrix', 'Vmatrix',
    'array', 'cases', 'aligned', 'gathered'
];

/**
 * 化学命令标识符
 */
const CHEMISTRY_COMMANDS = [
    '\\ce{', '\\chemfig{', '\\schemestart', '\\arrow'
];

/**
 * 解析公式类型和特征
 * @param {string} formula - LaTeX公式字符串
 * @returns {Object} 解析结果
 */
function parseFormula(formula) {
    const trimmed = formula.trim();

    // 检查是否包含非ASCII字符
    const hasUnicodeChars = /[^\x00-\x7F]/.test(trimmed);

    // 检测化学命令
    const hasChemistryCommands = CHEMISTRY_COMMANDS.some(cmd =>
        trimmed.includes(cmd)
    );

    // 检测数学环境
    const hasMathEnvironments = MATH_ENVIRONMENTS.some(env =>
        trimmed.includes(`\\begin{${env}}`) || trimmed.includes(`\\end{${env}}`)
    );

    // 检测数学模式标记
    const hasDisplayMath = (trimmed.includes('\\[') && trimmed.includes('\\]')) ||
        (trimmed.startsWith('$$') && trimmed.endsWith('$$'));
    const hasInlineMath = (trimmed.startsWith('$') && trimmed.endsWith('$') && !trimmed.startsWith('$$'));

    // 确定公式类型
    let type = FormulaType.MATH; // 默认为数学公式
    if (hasChemistryCommands) {
        type = FormulaType.CHEMISTRY;
    } else if (hasMathEnvironments) {
        type = FormulaType.MATH;
    }

    console.log(`🔍 公式类型: ${type}${hasMathEnvironments ? ' (含数学环境)' : ''}${hasUnicodeChars ? ' (含Unicode)' : ''}`);

    return {
        type,
        features: {
            hasChemistryCommands,
            hasMathEnvironments,
            hasDisplayMath,
            hasInlineMath,
            hasUnicodeChars
        },
        original: formula
    };
}

/**
 * 处理公式 - 简化版，严格按输入格式处理
 * @param {Object} parsed - 解析结果
 * @param {Object} options - 处理选项
 * @returns {string} 处理后的公式
 */
function processFormula(parsed, options = {}) {
    const { color, fontSize } = options;
    let processed = parsed.original.trim();

    console.log(`📐 严格格式模式：直接使用输入格式`);

    // 只处理字体大小和颜色，不改变公式结构
    if (fontSize || (color && color !== 'black' && color !== '#000000')) {
        let prefix = '';

        if (fontSize) {
            const fontCmd = getFontSizeCommand(fontSize);
            prefix += `\\${fontCmd} `;
            console.log(`📏 应用字体大小: ${fontCmd}`);
        }

        if (color && color !== 'black' && color !== '#000000') {
            const colorCmd = color.startsWith('#') ?
                `\\color[HTML]{${color.substring(1)}}` :
                `\\color{${color}}`;
            prefix += `${colorCmd} `;
            console.log(`🎨 应用颜色: ${color}`);
        }

        if (prefix) {
            // 根据公式类型添加前缀
            if (parsed.features.hasMathEnvironments) {
                // 数学环境：在环境前添加
                processed = `{${prefix.trim()} ${processed}}`;
            } else if (processed.startsWith('$') && processed.endsWith('$')) {
                // $...$ 公式：在$后添加
                const inner = processed.substring(1, processed.length - 1);
                processed = `$${prefix}${inner}$`;
            } else if (processed.startsWith('\\[') && processed.endsWith('\\]')) {
                // \[...\] 公式：在\[后添加
                const inner = processed.substring(2, processed.length - 2).trim();
                processed = `\\[${prefix}${inner} \\]`;
            } else if (processed.startsWith('\\ce{')) {
                // 化学公式：在外层包装
                processed = `{${prefix.trim()} ${processed}}`;
            } else {
                // 其他情况：直接在前面添加
                processed = `{${prefix.trim()} ${processed}}`;
            }
        }
    }

    console.log(`✅ 最终处理结果: ${processed.substring(0, 100)}${processed.length > 100 ? '...' : ''}`);
    return processed;
}

/**
 * 获取字体大小命令
 */
function getFontSizeCommand(fontSize) {
    const size = parseInt(fontSize);
    if (size <= 8) return 'tiny';
    if (size <= 10) return 'scriptsize';
    if (size <= 12) return 'small';
    if (size <= 17) return 'large';
    if (size <= 20) return 'Large';
    if (size <= 25) return 'LARGE';
    return 'huge';
}

module.exports = {
    FormulaType,
    parseFormula,
    processFormula
};
