# 数学公式渲染微服务 API 文档

## 概述

该API提供了将LaTeX数学公式渲染为PNG图像的功能。通过简单的HTTP请求，可以获取渲染后的数学公式，用于网页、文档或应用程序中。

## 基本信息

- **基础URL**: `http://localhost:3000` (部署后请替换为实际地址)
- **支持的格式**: PNG
- **支持方法**: GET, POST

## API端点

### 渲染数学公式

将LaTeX格式的数学公式渲染为PNG图像。

#### 请求

**GET /api/render**

```
GET /api/render?formula=E%3Dmc%5E2
```

**POST /api/render**

```
POST /api/render
Content-Type: application/json

{
  "formula": "$E = mc^2$"
}
```

#### 参数

| 参数名          | 类型   | 必填 | 默认值      | 描述                                                                     |
| --------------- | ------ | ---- | ----------- | ------------------------------------------------------------------------ |
| formula         | string | 是   | -           | LaTeX格式的数学公式，如 `E = mc^2` 或 `\frac{-b \pm \sqrt{b^2-4ac}}{2a}` |
| color           | string | 否   | black       | 公式文本颜色，接受十六进制颜色代码或颜色名称                             |
| backgroundColor | string | 否   | transparent | 背景颜色，接受十六进制颜色代码或颜色名称，`transparent`表示透明背景      |
| width           | number | 否   | -           | 指定图片宽度(像素)。若只指定宽度，高度会等比缩放。                       |
| height          | number | 否   | -           | 指定图片高度(像素)。若只指定高度，宽度会等比缩放。                       |
| padding         | number | 否   | 0           | 公式周围的内边距(像素)。                                                 |

#### 响应

**成功**

* **Content-Type**: `image/png`
* **Body**: 渲染后的图像数据

**错误**

* **Content-Type**: `application/json`
* **Status Code**: 400 (请求错误) 或 500 (服务器错误)
* **Body**:
```json
{
  "error": "错误信息"
}
```

## 使用示例

### 基本使用

#### 渲染简单公式为PNG

```
GET /api/render?formula=%24E%3Dmc%5E2%24
```

#### 渲染公式为红色PNG图像

```
GET /api/render?formula=%24%5Csum_%7Bi%3D1%7D%5E%7Bn%7Di%5E2%24&color=%23FF0000&width=300
```

### 高级选项

#### 带背景色的公式

```
GET /api/render?formula=%24%5Cfrac%7B-b%20%5Cpm%20%5Csqrt%7Bb%5E2-4ac%7D%7D%7B2a%7D%24&backgroundColor=%23f0f0f0
```

#### 带内边距的PNG图像

```
GET /api/render?formula=%24%5Cint_%7Ba%7D%5E%7Bb%7D%20f(x)%20%5C%2C%20dx%20%3D%20F(b)%20-%20F(a)%24&padding=10
```

#### 指定尺寸的PNG公式

```
GET /api/render?formula=%24%5Clim_{x%20%5Cto%20%5Cinfty}%20%5Cfrac{1}{x}%20%3D%200%24&width=400&height=100
```

## 参数详解

### 尺寸控制

- **width/height**: 直接指定输出图像的宽度/高度（像素）。
  - 若只提供一个参数，系统会按原始比例自动计算另一个参数。
  - 如果同时指定 `width` 和 `height`，图像将被缩放以适应指定的边界框，同时保持其原始宽高比，图像不会被拉伸。
- **padding**: 为公式周围添加内边距（像素）。

### 样式控制

- **color**: 公式的主要颜色。
- **backgroundColor**: 背景颜色。当值为"transparent"或未指定时，背景将透明。

## 错误码

| 状态码 | 描述                         |
| ------ | ---------------------------- |
| 400    | 请求参数错误，如缺少必填参数 |
| 500    | 服务器内部错误，如渲染失败   |

## 注意事项

1. LaTeX公式需要进行URL编码，尤其是在GET请求中
2. 普通数学公式需使用 `$...$` 包裹，例如 `$E=mc^2$`。对于 `align` 等数学环境，则直接使用，无需包裹。
3. 当同时指定`width`和`height`时，系统会保持公式的原始宽高比，并使其适应边界框。
4. 背景色仅在 `backgroundColor` 参数被设置为 `transparent` 以外的有效颜色值时生效。
5. 过于复杂的公式可能需要较长渲染时间
6. 图像的最大尺寸和复杂度可能受到服务器资源限制
7. 最后更新时间: 2025年5月7日