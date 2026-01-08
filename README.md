# 墨尔本NDVI计算GEE Web应用

## 应用功能
1. 选择墨尔本SA4区域；
2. 一键计算该区域的Sentinel-2 NDVI（归一化植被指数）；
3. 导出NDVI影像（GeoTIFF）和SA2级统计结果（CSV）。

## 数据来源
- 矢量数据：澳大利亚SA2行政区划（2021年，GDA2020）；
- 影像数据：Sentinel-2表面反射率影像（COPERNICUS/S2_HARMONIZED）。

## 访问应用
https://numeric-cinema-483506-n8.projects.earthengine.app/view/melndvicaoapp

## 脚本代码
https://code.earthengine.google.com/8761b9fe48c9bfceeff8fe14344bf85c

## 使用步骤
1. 打开应用链接；
2. 在左侧面板选择SA4区域（如“Melbourne - Inner”）；
3. 点击“运行NDVI计算”，等待地图加载NDVI影像；
4. 点击“导出NDVI影像”或“导出NDVI统计”，下载结果。
