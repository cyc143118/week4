// 1. 数据资产路径（替换为你的SA2资产路径）
var SA2_ASSET = 'users/zishenjj/SA2_2021_Mel_WGS84'; 
var FIELD_SA2 = 'SA2_NAME21'; // SA2名称字段
var FIELD_SA4 = 'SA4_NAME21'; // SA4名称字段（用于下拉选择）

// 2. 时间范围（夏季：10月-次年3月）
var START_DATE = '2024-10-01'; 
var END_DATE = '2025-03-31';

// 3. 影像筛选参数
var CLOUD_MAX = 15; // 最大云量（15%）
var SCALE = 10; // Sentinel-2分辨率（10米）

// 4. 影像集合与波段配置
var S2_COLLECTION = 'COPERNICUS/S2_HARMONIZED'; // Sentinel-2数据集ID
var BANDS_NDVI = ['B8', 'B4']; // NDVI所需波段（NIR:B8, Red:B4）

// 5. 可视化与导出参数
var NDVI_PALETTE = ['brown', 'yellow', 'green']; // NDVI颜色渐变
var MAX_PIXELS = 1e13; // 最大导出像素数

// 加载SA2矢量集合
var SA2 = ee.FeatureCollection(SA2_ASSET);

// 初始地图中心定位到SA2，缩放级别8（城市级）
Map.centerObject(SA2, 8);

// 创建SA2的黄色轮廓图层（默认隐藏，用户可手动开启）
var outlineAll = ee.Image().paint(SA2, 0, 1);
Map.addLayer(outlineAll, {palette: 'yellow'}, 'SA2边界（默认隐藏）', false); 
// 最后一个参数false：图层默认不显示



// 创建UI面板（宽度340px，内边距12px，避免内容拥挤）
var panel = ui.Panel({
  style: {width: '340px', padding: '12px'}
});
// 将面板插入到页面左侧（ui.root为GEE页面的根容器）
ui.root.insert(0, panel);
// 添加应用主标题（加粗，18px字体）
panel.add(ui.Label('大墨尔本地区NDVI计算器', {
  fontWeight: 'bold', 
  fontSize: '18px'
}));

// 添加操作步骤说明（灰色小字体，换行用\n）
panel.add(ui.Label(
  '步骤1：选择一个SA4区域。\n' + 
  '步骤2：点击“运行NDVI计算”按钮。\n' + 
  '步骤3：导出NDVI影像（SA4范围）或统计结果（SA2级别）。', 
  {fontSize: '12px', color: 'gray'}
));
// 添加“SA4选择”标签
panel.add(ui.Label('选择SA4区域：'));

// 创建下拉选择框（占位提示文字，水平拉伸充满面板）
var sa4Select = ui.Select({
  placeholder: '加载中...', 
  style: {stretch: 'horizontal'}
});
panel.add(sa4Select);

// 创建“运行NDVI计算”按钮
var runBtn = ui.Button({
  label: '运行NDVI计算', 
  style: {stretch: 'horizontal'}
});

// 创建“导出NDVI影像”按钮
var expImgBtn = ui.Button({
  label: '导出NDVI影像（GeoTIFF）', 
  style: {stretch: 'horizontal'}
});

// 创建“导出NDVI统计”按钮
var expCsvBtn = ui.Button({
  label: '导出NDVI统计（CSV）', 
  style: {stretch: 'horizontal'}
});

// 将按钮添加到面板（按钮间自动换行）
panel.add(runBtn);
panel.add(expImgBtn);
panel.add(expCsvBtn);

// 消息提示区（红色字体，用于显示警告/成功信息）
var msg = ui.Label('', {color: 'tomato'});
// 结果输出区（用于显示下载链接）
var out = ui.Panel();

panel.add(msg);
panel.add(out);

// 函数1：根据输入的AOI（感兴趣区）加载筛选后的Sentinel-2影像
function getS2(aoi) {
  return ee.ImageCollection(S2_COLLECTION)
    .filterBounds(aoi) // 按AOI筛选
    .filterDate(START_DATE, END_DATE) // 按时间筛选
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_MAX)); // 按云量筛选
}

// 函数2：对影像集合做中位数合成并裁剪到AOI
function compositeMedian(aoi) {
  return getS2(aoi).median().clip(aoi);
}

// 函数3：计算影像的NDVI并命名为“NDVI”
function calcNDVI(img) {
  return img.normalizedDifference(BANDS_NDVI).rename('NDVI');
}

// 函数4：对NDVI影像按SA2分区计算平均值
function zonalStatsPerSA2(ndviImg, sa4Name) {
  // 筛选该SA4下的所有SA2
  var sa2InSa4 = SA2.filter(ee.Filter.eq(FIELD_SA4, sa4Name));
  // 分区统计
  return ndviImg.reduceRegions({
    collection: sa2InSa4,
    reducer: ee.Reducer.mean(),
    scale: SCALE
  });
}

// 从SA2集合中提取所有SA4名称，去重并排序
var sa4List = SA2.aggregate_array(FIELD_SA4).distinct().sort();

// 将SA4列表加载到下拉框（需用evaluate()将服务器端数据转为客户端数据）
sa4List.evaluate(function(list) {
  sa4Select.items().reset(list); // 重置下拉框选项为SA4列表
  sa4Select.setPlaceholder('选择SA4区域（共' + list.length + '个选项）');
});

// 定义全局变量，存储上次选择的SA4信息（避免重复计算）
var lastSa4Name = null; // 上次选择的SA4名称
var lastSa4Geom = null; // 上次选择的SA4几何范围
var lastNdvi = null; // 上次计算的NDVI影像

// 下拉框变化事件：选择不同SA4时，更新地图中心并重置状态
sa4Select.onChange(function(sa4name) {
  // 重置上次计算结果
  lastNdvi = null;
  lastSa4Name = null;
  lastSa4Geom = null;

  // 筛选该SA4下的SA2，获取其几何范围
  var fc = SA2.filter(ee.Filter.eq(FIELD_SA4, sa4name));
  lastSa4Geom = fc.geometry();
  lastSa4Name = sa4name;

  // 地图中心定位到该SA4，缩放级别10（区域级）
  Map.centerObject(lastSa4Geom, 10);

  // 重置地图图层（只保留SA2边界）
  Map.layers().reset();
  Map.addLayer(outlineAll, {palette: 'yellow'}, 'SA2边界', false);
});

runBtn.onClick(function() {
  // 清空之前的消息和结果
  msg.setValue('');
  out.clear();

  // 获取下拉框选择的SA4名称
  var sa4name = sa4Select.getValue();

  // 若未选择SA4，显示警告
  if (!sa4name) {
    msg.setValue('请先选择一个SA4区域！');
    return;
  }

  // 获取该SA4的几何范围
  var geom = lastSa4Geom;

  // 执行影像合成、NDVI计算
  var s2_comp = compositeMedian(geom);
  var ndvi = calcNDVI(s2_comp);
  lastNdvi = ndvi; // 保存NDVI影像到全局变量，用于后续导出

  // 重置地图图层，添加NDVI和SA4边界
  Map.layers().reset();
  Map.addLayer(ndvi, {min: 0, max: 1, palette: NDVI_PALETTE}, 'NDVI影像（' + sa4name + '）');
  var outlineSa4 = ee.Image().paint(SA2.filter(ee.Filter.eq(FIELD_SA4, sa4name)), 0, 2);
  Map.addLayer(outlineSa4, {palette: 'yellow'}, sa4name + '边界');

  // 显示成功消息
  msg.setValue('NDVI计算完成！可点击下方按钮导出结果。');
});

expImgBtn.onClick(function() {
  msg.setValue('');

  // 若未计算NDVI，显示警告
  if (!lastNdvi || !lastSa4Geom) {
    msg.setValue('请先运行NDVI计算！');
    return;
  }

  // 裁剪NDVI影像到SA4范围
  var ndviClip = lastNdvi.clip(lastSa4Geom);

  // 生成GeoTIFF下载链接（getDownloadURL()生成临时下载地址）
  var url = ndviClip.getDownloadURL({
    region: lastSa4Geom,
    scale: SCALE,
    format: 'GEO_TIFF'
  });

  // 在结果区显示下载链接
  out.clear();
  out.add(ui.Label('NDVI影像下载（GeoTIFF）', {fontWeight: 'bold'}));
  out.add(ui.Label('点击下载', null, url)); // 第二个参数：样式，第三个参数：链接
});

expCsvBtn.onClick(function() {
  msg.setValue('');

  // 若未计算NDVI，显示警告
  if (!lastNdvi || !lastSa4Name) {
    msg.setValue('请先运行NDVI计算！');
    return;
  }

  // 计算该SA4下各SA2的平均NDVI
  var table = zonalStatsPerSA2(lastNdvi, lastSa4Name);

  // 生成CSV下载链接
  var url = table.getDownloadURL({
    format: 'CSV'
  });

  // 在结果区显示下载链接
  out.clear();
  out.add(ui.Label('NDVI统计下载（CSV）', {fontWeight: 'bold'}));
  out.add(ui.Label('点击下载', null, url));
});
