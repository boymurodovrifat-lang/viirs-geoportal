/**********************************************************************
 * VIIRS tungi yorug'lik monitoringi — Google Earth Engine Code Editor
 * Word hujjatidagi buzilgan satrlar va || operatorlari tiklandi.
 * Kodni to'liq nusxalang; Markdown ``` belgilarini qo'shmang.
 *
 * Ma'lumot: NASA/VIIRS/002/VNP46A2, gap-filled NTL, 500 m.
 * Asl koddagi radiometrik qiymatlar va AREA_THR = 1 saqlandi.
 * Qo'shimcha QA filtri yoki radiometrik ko'paytiruvchi qo'llanmagan.
 * Gap-filled qiymat har doim shu kundagi bevosita kuzatuv emas.
 * Joriy yil natijalari mavjud sanagacha hisoblanadi.
 *
 * Agar chegara asseti sizga ochilmasa, ASSET ni o'zingizdagi viloyatlar
 * FeatureCollection manziliga, NAME_FIELD ni uning nom maydoniga yozing.
 * Respublika jami viloyatlar yig'indisi: chegaralar ustma-ust tushmasin.
 *
 * Rasmiy manba:
 * https://developers.google.com/earth-engine/datasets/catalog/NASA_VIIRS_002_VNP46A2
 **********************************************************************/

// 1. SOZLAMALAR — har bir buyruq izohdan alohida satrda.
var ASSET = 'projects/ee-marufnurullayev12022/assets/RES_chegara_STAT';
var NAME_FIELD = 'name_uz';
var BAND = 'Gap_Filled_DNB_BRDF_Corrected_NTL';
var SCALE = 500;
var MAX_KUNLIK = 366;
var AREA_THR = 1;
var MS_DAY = 86400000;
var FIRST_DATE = '2012-01-19';

var chegara = ee.FeatureCollection(ASSET);
var DAILY = ee.ImageCollection('NASA/VIIRS/002/VNP46A2')
  .filterBounds(ee.Geometry.Rectangle([55,36,75,47],null,false))
  .select(BAND);
var GRID = ee.Projection('EPSG:4326',[0.00416666666,0,-180,0,-0.00416666666,60]);
var EMPTY = ee.Image.constant(0).rename('NTL').selfMask();
var VIS = {
  min: 0, max: 30,
  palette: ['000004', '2c115f', '721f81', 'b73779', 'f1605d', 'feb078', 'fcfdbf']
};
var state = {
  ready: false, geom: null, latest: null, first: null,
  ratingToken: 0, areaToken: 0, runToken: 0
};
var yearlyCache = {};

function meanBetween(start, endExclusive) {
  var col = DAILY.filterDate(start, endExclusive);
  return ee.Image(ee.Algorithms.If(
    col.size().gt(0), col.mean().rename('NTL'), EMPTY
  ));
}

function annualMean(year) {
  if (!yearlyCache[year]) {
    // Sum/count preserves observation weighting while bounding monthly memory.
    var monthly = ee.ImageCollection.fromImages(ee.List.sequence(1,12).map(function(month) {
      var begin = ee.Date.fromYMD(year,month,1);
      var col = DAILY.filterDate(begin,begin.advance(1,'month'));
      var reduced = col.reduce(ee.Reducer.sum().combine({reducer2:ee.Reducer.count(),sharedInputs:true}),8);
      return ee.Image(ee.Algorithms.If(col.size().gt(0),reduced,
        ee.Image.constant([0,0]).rename([BAND+'_sum',BAND+'_count']))).unmask(0);
    })).sum();
    var count = monthly.select(BAND+'_count');
    yearlyCache[year] = monthly.select(BAND+'_sum').divide(count).updateMask(count.gt(0)).rename('NTL');
  }
  return yearlyCache[year];
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var date = new Date(value + 'T00:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseYear(value) {
  return /^\d{4}$/.test(value) ? Number(value) : NaN;
}

function rangeError(a, b) {
  if (!validDate(a) || !validDate(b)) {
    return 'Sanani YYYY-MM-DD formatida to\'g\'ri kiriting.';
  }
  if (a > b) return 'Boshlanish sanasi tugash sanasidan keyin bo\'lmasin.';
  if (a < state.first || b > state.latest) {
    return 'Mavjud sana oralig\'i: ' + state.first + ' — ' + state.latest + '.';
  }
  return '';
}

function asNumber(value) {
  return typeof value === 'number' && isFinite(value) ? value : null;
}

function formatNumber(value, decimals) {
  return value === null ? '—' : value.toFixed(decimals);
}

function meanOf(img, geom) {
  return img.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: geom,
    scale: SCALE, crs: GRID, maxPixels: 1e9, tileScale: 4
  }).get('NTL');
}

// 2. XARITA — yangi Map ishlatilgani uchun qayta Run panelni takrorlamaydi.
var map = ui.Map();
map.setOptions('HYBRID');
map.setCenter(64.5, 41.3, 6);
map.style().set('stretch', 'both');
map.layers().add(ui.Map.Layer(EMPTY, VIS, 'NTL', false));
map.layers().add(ui.Map.Layer(
  chegara.style({color: '00FFFF', fillColor: '00000000', width: 1}),
  {}, 'Chegara'
));

var legend = ui.Panel({style: {position: 'bottom-left', padding: '6px 8px'}});
legend.add(ui.Label('NTL (nW/cm²/sr)', {fontWeight: 'bold', margin: '0 0 4px 0'}));
legend.add(ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0),
  params: {
    bbox: [0, 0, 1, 0.1], dimensions: '200x14', format: 'png',
    min: 0, max: 1, palette: VIS.palette
  },
  style: {stretch: 'horizontal', margin: '0'}
}));
legend.add(ui.Panel([
  ui.Label('0', {margin: '0'}),
  ui.Label('15', {margin: '0', textAlign: 'center', stretch: 'horizontal'}),
  ui.Label('30+', {margin: '0'})
], ui.Panel.Layout.flow('horizontal')));
map.add(legend);

// 3. CHAP PANEL
var panel = ui.Panel({style: {width: '400px', padding: '10px'}});
panel.add(ui.Label("🌙 Tungi yorug'lik (NTL) monitoringi", {
  fontSize: '20px', fontWeight: 'bold'
}));
panel.add(ui.Label("Nuqta yoki polygon chizing — shu joydagi o'rtacha qiymat hisoblanadi.", {
  color: '555555'
}));
var availability = ui.Label('Ma\'lumot va chegara tekshirilmoqda...', {
  fontSize: '12px', color: '555555'
});
panel.add(availability);
var statusLabel = ui.Label('', {margin: '8px 0', fontWeight: 'bold'});
var chartPanel = ui.Panel();

var drawingTools = map.drawingTools();
drawingTools.setLinked(false);
drawingTools.setShown(false);
drawingTools.layers().reset([]);
var geomLayer = ui.Map.GeometryLayer({
  geometries: [], name: 'Tanlangan joy', color: '#FF0000'
});
drawingTools.layers().add(geomLayer);

function clearGeometry() {
  drawingTools.stop();
  geomLayer.geometries().reset([]);
  state.geom = null;
  state.runToken++;
  chartPanel.clear();
}

function startDraw(shape) {
  if (!state.ready) {
    statusLabel.setValue('Avval ma\'lumot yuklanishini kuting.');
    return;
  }
  clearGeometry();
  drawingTools.setShape(shape);
  drawingTools.draw();
  statusLabel.setValue(shape === 'point' ?
    "Xaritada nuqta qo'ying." : 'Polygon chizing; tugatish uchun ikki marta bosing.');
}

panel.add(ui.Panel([
  ui.Button({label: '📍 Nuqta', onClick: function() { startDraw('point'); },
    style: {stretch: 'horizontal'}}),
  ui.Button({label: '⬠ Polygon', onClick: function() { startDraw('polygon'); },
    style: {stretch: 'horizontal'}}),
  ui.Button({label: '🗑 Tozalash', onClick: function() {
    clearGeometry(); statusLabel.setValue('Tozalandi.');
  }, style: {stretch: 'horizontal'}})
], ui.Panel.Layout.flow('horizontal')));

function dateBox(value, placeholder) {
  return ui.Textbox({value: value, placeholder: placeholder,
    style: {stretch: 'horizontal'}});
}

function twoBoxes(first, second) {
  return ui.Panel([
    ui.Panel([ui.Label('Boshlanish:'), first], null, {stretch: 'horizontal'}),
    ui.Panel([ui.Label('Tugash:'), second], null, {stretch: 'horizontal'})
  ], ui.Panel.Layout.flow('horizontal'));
}

function sectionLabel(text) {
  return ui.Label(text, {fontWeight: 'bold', margin: '12px 0 2px 0'});
}

var rStart = dateBox('', 'YYYY-MM-DD');
var rEnd = dateBox('', 'YYYY-MM-DD');
var startBox = dateBox('', 'YYYY-MM-DD');
var endBox = dateBox('', 'YYYY-MM-DD');
var y1Box = dateBox('2020', 'YYYY');
var y2Box = dateBox('', 'YYYY');
panel.add(sectionLabel('— Xarita (raster) sanasi —'));
panel.add(twoBoxes(rStart, rEnd));
panel.add(sectionLabel("— Kunlik grafik oralig'i —"));
panel.add(twoBoxes(startBox, endBox));
panel.add(sectionLabel("— Yillik grafik oralig'i —"));
panel.add(twoBoxes(y1Box, y2Box));
panel.add(ui.Button({label: 'Hisoblash', onClick: run,
  style: {stretch: 'horizontal'}}));
panel.add(statusLabel);
panel.add(chartPanel);

// 4. O'NG PANEL VA JADVALLAR
var rightPanel = ui.Panel({style: {width: '560px', padding: '10px'}});
rightPanel.add(ui.Label('🏆 Viloyatlar reytingi', {
  fontSize: '20px', fontWeight: 'bold'
}));
var ratingSub = ui.Label('', {color: '555555', fontSize: '12px'});
var ratingTable = ui.Panel();
rightPanel.add(ratingSub);
rightPanel.add(ratingTable);
rightPanel.add(ui.Label('🗺 NTL maydoni reytingi (km²)', {
  fontSize: '20px', fontWeight: 'bold', margin: '28px 0 0 0'
}));
rightPanel.add(ui.Label(
  "Yillik o'rtacha NTL > " + AREA_THR +
  ' nW/cm²/sr bo\'lgan piksellar maydoni. Saralash 3-yil bo\'yicha. ' +
  'Yilni o\'zgartirib Enter bosing.',
  {color: '555555', fontSize: '12px'}
));
function yearBox(value) {
  return ui.Textbox({value: value, style: {width: '80px', margin: '0 8px'},
    onChange: function() { if (state.ready) updateArea(); }});
}
var aY = [yearBox('2020'), yearBox('2023'), yearBox('')];
rightPanel.add(ui.Panel([
  ui.Label('Yil →', {width: '210px', color: '888888'}), aY[0], aY[1], aY[2]
], ui.Panel.Layout.flow('horizontal')));
var areaSub = ui.Label('', {color: '555555', fontSize: '12px'});
var areaTable = ui.Panel();
rightPanel.add(areaSub);
rightPanel.add(areaTable);
rightPanel.add(ui.Label(
  'Gap-filled mahsulot ishlatiladi. Joriy yil — mavjud sanagacha. ' +
  'Yillik davrlar uzunligi farq qilsa, natijalarni ehtiyotkorlik bilan solishtiring. ' +
  '— belgisi ma\'lumot yo\'qligini bildiradi.',
  {fontSize: '11px', color: '777777', margin: '10px 0'}
));
ui.root.widgets().reset([panel, map, rightPanel]);
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

function makeRow(values, widths, kind) {
  var background = kind === 'header' ? 'dddddd' :
    kind === 'total' ? 'cfe3ff' : kind === 'shade' ? 'f4f4f4' : 'ffffff';
  var cells = values.map(function(value, index) {
    return ui.Label(String(value), {
      fontSize: '13px', margin: '0', padding: '5px 2px', width: widths[index],
      backgroundColor: background,
      fontWeight: kind === 'header' || kind === 'total' ? 'bold' : 'normal',
      textAlign: index > 1 ? 'right' : 'left'
    });
  });
  return ui.Panel(cells, ui.Panel.Layout.flow('horizontal'), {margin: '0'});
}

function sortDescending(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function updateRating(img, label) {
  var token = ++state.ratingToken;
  ratingSub.setValue(label);
  ratingTable.clear();
  ratingTable.add(ui.Label('Hisoblanmoqda...'));
  var stats = img.reduceRegions({
    collection: chegara.select([NAME_FIELD]), reducer: ee.Reducer.mean(),
    scale: SCALE, crs: GRID, tileScale: 16
  }).map(function(f) {
    return ee.Feature(null, {name: f.get(NAME_FIELD), mean: f.get('mean')});
  });
  stats.evaluate(function(fc, err) {
    if (token !== state.ratingToken) return;
    ratingTable.clear();
    if (err || !fc || !fc.features || fc.features.length === 0) {
      ratingTable.add(ui.Label('Reyting hisoblanmadi: ' + (err || "ma'lumot yo'q"),
        {color: 'cc0000'}));
      return;
    }
    var rows = fc.features.map(function(f) {
      return {name: String(f.properties.name), val: asNumber(f.properties.mean)};
    });
    rows.sort(function(a, b) { return sortDescending(a.val, b.val); });
    var widths = ['30px', '280px', '160px'];
    ratingTable.add(makeRow(['№', 'Viloyat', "O'rtacha"], widths, 'header'));
    rows.forEach(function(row, i) {
      ratingTable.add(makeRow([i + 1, row.name, formatNumber(row.val, 3)],
        widths, i % 2 ? 'shade' : null));
    });
    ratingTable.add(ui.Label('Birlik: nW/cm²/sr', {fontSize: '11px', color: '777777'}));
  });
}

function updateArea() {
  var token = ++state.areaToken;
  var lastYear = Number(state.latest.slice(0, 4));
  var years = aY.map(function(box) { return parseYear(box.getValue()); });
  areaTable.clear();
  areaSub.setValue('');
  if (years.some(function(year) {
    return isNaN(year) || year < 2012 || year > lastYear;
  })) {
    areaTable.add(ui.Label('Yillar 2012–' + lastYear + ' oralig\'ida bo\'lsin.',
      {color: 'cc0000'}));
    return;
  }
  areaTable.add(ui.Label('Hisoblanmoqda...'));
  areaSub.setValue('Eng oxirgi mavjud sana: ' + state.latest +
    '. 2012-yil 19-yanvardan boshlanadi.');
  var bands = years.map(function(year, index) {
    var mean;
    if (year === 2020 || year === 2023 || year === 2024) {
      var frozen = ee.Image('projects/ee-boymurodovrifat/assets/VIIRS_stats_'+year+(year===2024?'_validation':'')+'_20261021');
      var n = frozen.select('gap_count');
      mean = frozen.select('gap_sum').divide(n).updateMask(n.gt(0)).rename('NTL');
    } else { mean = annualMean(year); }
    // Nol = kuzatilgan, ammo chegaradan past; mask = ma'lumot yo'q.
    return ee.Image.pixelArea().divide(1e6).multiply(mean.gt(AREA_THR))
      .updateMask(mean.mask()).rename('a' + index);
  });
  var stats = ee.Image.cat(bands).reduceRegions({
    collection: chegara.select([NAME_FIELD]), reducer: ee.Reducer.sum(),
    scale: SCALE, crs: GRID, tileScale: 16
  }).map(function(f) {
    return ee.Feature(null, {
      name: f.get(NAME_FIELD), a0: f.get('a0'), a1: f.get('a1'), a2: f.get('a2')
    });
  });
  stats.evaluate(function(fc, err) {
    if (token !== state.areaToken) return;
    areaTable.clear();
    if (err || !fc || !fc.features || fc.features.length === 0) {
      areaTable.add(ui.Label('Maydon hisoblanmadi: ' + (err || "ma'lumot yo'q"),
        {color: 'cc0000'}));
      return;
    }
    var rows = fc.features.map(function(f) {
      var p = f.properties;
      return {name: String(p.name), values: [asNumber(p.a0), asNumber(p.a1), asNumber(p.a2)]};
    });
    rows.sort(function(a, b) { return sortDescending(a.values[2], b.values[2]); });
    var total = [0, 0, 0];
    var widths = ['30px', '180px', '85px', '85px', '85px'];
    areaTable.add(makeRow(['№', 'Viloyat'].concat(years), widths, 'header'));
    rows.forEach(function(row, i) {
      row.values.forEach(function(value, k) {
        if (value === null) total[k] = null;
        else if (total[k] !== null) total[k] += value;
      });
      var values = row.values.map(function(value) { return formatNumber(value, 1); });
      areaTable.add(makeRow([i + 1, row.name].concat(values), widths, i % 2 ? 'shade' : null));
    });
    areaTable.add(makeRow(['', 'Respublika jami'].concat(total.map(function(value) {
      return formatNumber(value, 1);
    })), widths, 'total'));
    areaTable.add(ui.Label('Birlik: km². Jami — assetdagi hududlar yig\'indisi.',
      {fontSize: '11px', color: '777777'}));
  });
}

// 5. RASTER VA GRAFIKLAR
function updateRaster() {
  var a = rStart.getValue();
  var b = rEnd.getValue();
  var error = rangeError(a, b);
  if (error) { statusLabel.setValue(error); return false; }
  var img = meanBetween(ee.Date(a), ee.Date(b).advance(1, 'day'));
  map.layers().set(0, ui.Map.Layer(img.clipToCollection(chegara), VIS, 'NTL', true, 1));
  updateRating(img, a === b ? 'Sana: ' + a : 'Sana: ' + a + ' → ' + b);
  return true;
}

function drawCharts(geom, sv, ev, y1, y2, token) {
  var s = ee.Date(sv);
  var dayCount = Math.round((new Date(ev).getTime() - new Date(sv).getTime()) / MS_DAY) + 1;
  // Bir sana bir nechta fazoviy tile'dan iborat bo'lishi mumkin.
  // Har kunning barcha tile'lari birlashtirilib, keyin statistika olinadi.
  var daily = ee.FeatureCollection(ee.List.sequence(0, dayCount - 1).map(function(offset) {
    var day = s.advance(ee.Number(offset), 'day');
    return ee.Feature(null, {
      date: day.format('YYYY-MM-dd'),
      value: meanOf(meanBetween(day, day.advance(1, 'day')), geom)
    });
  })).filter(ee.Filter.notNull(['value']));
  var yearly = ee.FeatureCollection(ee.List.sequence(y1, y2).map(function(year) {
    year = ee.Number(year).int();
    var image = meanBetween(ee.Date.fromYMD(year, 1, 1),
      ee.Date.fromYMD(year.add(1), 1, 1));
    return ee.Feature(null, {date: year.format('%d'), value: meanOf(image, geom)});
  })).filter(ee.Filter.notNull(['value']));

  // Avval natijalarni olish: bo'sh grafik va eski callback'larni boshqarish.
  ee.Dictionary({daily: daily.toList(MAX_KUNLIK), yearly: yearly.toList(100),
    mean: meanOf(meanBetween(ee.Date(rStart.getValue()),
      ee.Date(rEnd.getValue()).advance(1, 'day')), geom)
  }).evaluate(function(result, err) {
    if (token !== state.runToken) return;
    chartPanel.clear();
    if (err || !result) {
      statusLabel.setValue('Hisoblash xatosi: ' + (err || "natija yo'q"));
      return;
    }
    function addChart(features, type, title, color, xTitle) {
      if (!features || features.length === 0) {
        chartPanel.add(ui.Label(title + ": ma'lumot topilmadi."));
        return;
      }
      var data = [['Sana', 'NTL']];
      features.forEach(function(feature) {
        data.push([String(feature.properties.date), feature.properties.value]);
      });
      chartPanel.add(ui.Chart(data).setChartType(type).setOptions({
        title: title, legend: {position: 'none'},
        vAxis: {title: 'nW/cm²/sr'},
        hAxis: {title: xTitle, slantedText: type === 'LineChart', slantedTextAngle: 60},
        lineWidth: 2, pointSize: 3, colors: [color]
      }));
    }
    addChart(result.daily, 'LineChart', "NTL — kunlik o'rtacha", '1a73e8', 'Sana');
    addChart(result.yearly, 'ColumnChart', "NTL — yillik o'rtacha (" + y1 + '–' + y2 + ')',
      'e8710a', 'Yil');
    var mean = asNumber(result.mean);
    statusLabel.setValue(mean === null ?
      "Tanlangan joy va raster sanasi uchun ma'lumot topilmadi." :
      "Tanlangan joy: o'rtacha " + mean.toFixed(3) + ' nW/cm²/sr');
  });
}

function run() {
  if (!state.ready) {
    statusLabel.setValue('Ma\'lumot hali tayyor emas. Yuklanishini kuting.');
    return;
  }
  var token = ++state.runToken;
  chartPanel.clear();
  if (!updateRaster()) return;
  if (!state.geom) {
    statusLabel.setValue('Raster va reyting yangilanmoqda. Grafik uchun nuqta yoki polygon tanlang.');
    return;
  }
  var sv = startBox.getValue();
  var ev = endBox.getValue();
  var error = rangeError(sv, ev);
  if (error) { statusLabel.setValue('Kunlik grafik: ' + error); return; }
  var count = Math.round((new Date(ev).getTime() - new Date(sv).getTime()) / MS_DAY) + 1;
  if (count > MAX_KUNLIK) {
    statusLabel.setValue('Kunlik grafik ' + MAX_KUNLIK + ' kundan oshmasin.'); return;
  }
  var y1 = parseYear(y1Box.getValue());
  var y2 = parseYear(y2Box.getValue());
  var lastYear = Number(state.latest.slice(0, 4));
  if (isNaN(y1) || isNaN(y2) || y1 > y2 || y1 < 2012 || y2 > lastYear) {
    statusLabel.setValue('Yillar 2012–' + lastYear + ' oralig\'ida va ketma-ket bo\'lsin.'); return;
  }
  statusLabel.setValue('Hisoblanmoqda...');
  drawCharts(state.geom, sv, ev, y1, y2, token);
}

function onGeometryChange() {
  if (geomLayer.geometries().length() === 0) return;
  state.geom = geomLayer.toGeometry();
  drawingTools.stop();
  run();
}
drawingTools.onDraw(onGeometryChange);
drawingTools.onEdit(onGeometryChange);

// 6. ISHGA TUSHIRISH — sana O'zbekiston bilan kesishadigan tile'lardan olinadi.
ee.Dictionary({
  latest: DAILY.aggregate_max('system:time_start'),
  first: DAILY.aggregate_min('system:time_start'),
  regionCount: chegara.size(),
  fields: ee.Feature(chegara.first()).propertyNames(),
  namedCount: chegara.filter(ee.Filter.notNull([NAME_FIELD])).size()
}).evaluate(function(info, err) {
  if (err || !info || !info.latest || !info.first) {
    availability.setValue('Ma\'lumot yuklanmadi.');
    statusLabel.setValue('Chegara asseti va ruxsatlarini tekshiring. ' + (err || 'To\'plam bo\'sh.'));
    return;
  }
  if (info.fields.indexOf(NAME_FIELD) < 0 || info.namedCount !== info.regionCount) {
    statusLabel.setValue('NAME_FIELD ni tekshiring. Har bir hudud nomi bo\'lishi kerak. ' +
      'Asset maydonlari: ' + info.fields.join(', '));
    return;
  }
  state.latest = new Date(info.latest).toISOString().slice(0, 10);
  state.first = new Date(info.first).toISOString().slice(0, 10);
  if (state.first < FIRST_DATE) state.first = FIRST_DATE;
  var back = new Date(info.latest - 14 * MS_DAY).toISOString().slice(0, 10);
  if (back < state.first) back = state.first;
  rStart.setValue(state.latest, false);
  rEnd.setValue(state.latest, false);
  startBox.setValue(back, false);
  endBox.setValue(state.latest, false);
  y2Box.setValue(state.latest.slice(0, 4), false);
  aY[2].setValue(String(Math.min(2024,Number(state.latest.slice(0, 4)))), false); // latest frozen complete comparison year
  availability.setValue('Mavjud sanalar: ' + state.first + ' — ' + state.latest +
    '. Hududlar: ' + info.regionCount + '. Oxirgi kun ayrim hududlarda to\'liq bo\'lmasligi mumkin.');
  state.ready = true;
  map.centerObject(chegara, 6);
  run();
  updateArea();
});


// ===== TAHLILLAR v1.0.0 — qo'shimcha, asosiy portal saqlanadi =====
// Publication inputs match VIIRS_Reproduce_v05.py and its archived CSVs.
// No annual image export, external library or credentials are required here.
(function() {
  var pPal = {"magma": ["000004", "030312", "0a0822", "130d34", "1e1149", "2a115c", "38106c", "451077", "54137d", "601880", "6d1d81", "792282", "882781", "942c80", "a1307e", "ae347b", "bd3977", "ca3e72", "d6456c", "e24d66", "ec5860", "f3655c", "f8745c", "fb835f", "fd9467", "fea36f", "feb27a", "fec185", "fed194", "fde0a1", "fceeb0", "fcfdbf"], "viridis": ["440154", "470d60", "48186a", "482374", "472e7c", "453882", "424186", "3e4a89", "3a548c", "365d8d", "32658e", "2e6d8e", "2b758e", "287d8e", "25848e", "228c8d", "1f948c", "1e9c89", "20a386", "25ab82", "2eb37c", "3aba76", "48c16e", "58c765", "6ccd5a", "7fd34e", "93d741", "a8db34", "c0df25", "d5e21a", "eae51a", "fde725"], "YlGnBu": ["ffffd9", "fafdcf", "f6fbc5", "f1fabb", "ecf7b1", "e2f4b2", "d9f0b3", "cfecb3", "c2e7b4", "b0e0b6", "9ed9b8", "8cd2ba", "78cbbc", "69c5be", "59bfc0", "4ab9c3", "3cb1c3", "33a7c2", "2a9ec1", "2195c0", "1e88bc", "1f7bb6", "206eb0", "2262aa", "2355a4", "234b9f", "24409a", "253595", "1e2e85", "172976", "0f2367", "081d58"]};
  var pSupport = ee.Dictionary({"Andijon viloyati": 99.68123837142069, "Buxoro viloyati": 99.84833857631045, "Farg‘ona viloyati": 99.93264248439571, "Jizzax viloyati": 97.21457011263543, "Namangan viloyati": 73.0021306205427, "Navoiy viloyati": 99.98424092352644, "Qashqadaryo viloyati": 88.63692749895351, "Qoraqalpog‘iston Respublikasi": 92.1318253580609, "Samarqand viloyati": 99.46167112897949, "Sirdaryo viloyati": 100.0, "Surxondaryo viloyati": 76.80866516411533, "Toshkent shahri": 100.0, "Toshkent viloyati": 55.315000009378224, "Xorazm viloyati": 99.51032487144613});
  var pTour = [{"region": "Andijon viloyati", "region_en": "Andijan", "qa_mean_full": 2.440039898830352, "persons_thousand": 76.9, "beds": 2456.0}, {"region": "Buxoro viloyati", "region_en": "Bukhara", "qa_mean_full": 0.5371262093818093, "persons_thousand": 267.2, "beds": 8423.0}, {"region": "Farg‘ona viloyati", "region_en": "Fergana", "qa_mean_full": 1.9140733226009652, "persons_thousand": 81.2, "beds": 5421.0}, {"region": "Jizzax viloyati", "region_en": "Jizzakh", "qa_mean_full": 0.5460771156277799, "persons_thousand": 66.3, "beds": 1544.0}, {"region": "Namangan viloyati", "region_en": "Namangan", "qa_mean_full": 1.3398048995643355, "persons_thousand": 66.4, "beds": 1449.0}, {"region": "Navoiy viloyati", "region_en": "Navoi", "qa_mean_full": 0.3624672335421275, "persons_thousand": 48.3, "beds": 1978.0}, {"region": "Qashqadaryo viloyati", "region_en": "Kashkadarya", "qa_mean_full": 0.9404629871657879, "persons_thousand": 71.3, "beds": 2366.0}, {"region": "Qoraqalpog‘iston Respublikasi", "region_en": "Karakalpakstan", "qa_mean_full": 0.3429175450098485, "persons_thousand": 38.4, "beds": 1579.0}, {"region": "Samarqand viloyati", "region_en": "Samarkand", "qa_mean_full": 1.1191600074699324, "persons_thousand": 428.4, "beds": 13827.0}, {"region": "Sirdaryo viloyati", "region_en": "Syrdarya", "qa_mean_full": 1.181234947110524, "persons_thousand": 33.8, "beds": 731.0}, {"region": "Surxondaryo viloyati", "region_en": "Surkhandarya", "qa_mean_full": 0.5918771321525063, "persons_thousand": 91.6, "beds": 2464.0}, {"region": "Toshkent shahri", "region_en": "Tashkent city", "qa_mean_full": 36.53021262443937, "persons_thousand": 1267.1, "beds": 28348.0}, {"region": "Toshkent viloyati", "region_en": "Tashkent region", "qa_mean_full": 1.6430471377018223, "persons_thousand": 150.2, "beds": 3928.0}, {"region": "Xorazm viloyati", "region_en": "Khorezm", "qa_mean_full": 0.9433973512841645, "persons_thousand": 177.2, "beds": 4955.0}];
  var pRegions = ee.FeatureCollection('projects/ee-marufnurullayev12022/assets/RES_chegara_STAT');
  var pStats20 = ee.Image('projects/ee-boymurodovrifat/assets/VIIRS_stats_2020_20261021');
  var pStats23 = ee.Image('projects/ee-boymurodovrifat/assets/VIIRS_stats_2023_20261021');
  var pN20 = pStats20.select('q0_count');
  var pN23 = pStats23.select('q0_count');
  var pQ20 = pStats20.select('q0_sum').divide(pN20).updateMask(pN20.gt(0));
  var pQ23 = pStats23.select('q0_sum').divide(pN23).updateMask(pN23.gt(0));
  var pCommon = pN20.gte(30).and(pN23.gte(30));
  var pDomain = ee.Image.constant(1).clipToCollection(pRegions);
  var pMin = pN20.min(pN23);
  var pSeasonal = pCommon.and(pStats20.select('q_months5').gte(9))
    .and(pStats23.select('q_months5').gte(9));
  var pA = pQ20.gt(1), pB = pQ23.gt(1);
  // 0 below/equal both, 1 above both, 2 upward, 3 downward, 4 excluded.
  var pTransitions = pDomain.multiply(4).where(pCommon,0)
    .where(pCommon.and(pA).and(pB),1)
    .where(pCommon.and(pA.not()).and(pB),2)
    .where(pCommon.and(pA).and(pB.not()),3).toByte();
  var pColors = ['e8edf2','344c69','21a59b','df8a43','b9c5d0'];
  var pFocal = pRegions.filter(ee.Filter.inList('name_uz',[
    'Toshkent shahri','Samarqand viloyati','Buxoro viloyati','Xorazm viloyati']));
  var pSeasonRegions = pRegions.map(function(f){return f.set('retained_pct',pSupport.get(f.get('name_uz')));});
  var pSeasonImage = pSeasonRegions.reduceToImage(['retained_pct'],ee.Reducer.first());
  var pTourFC = ee.FeatureCollection(pTour.map(function(r){return ee.Feature(null,r);}));
  var pOriginal = ui.root.widgets().getJsArray().slice();
  var pLeft = ui.Map(), pRight = ui.Map();
  [pLeft,pRight].forEach(function(m){
    m.style().set('stretch','both'); m.setOptions('TERRAIN');
    m.setControlVisibility({layerList:true,zoomControl:true,mapTypeControl:false,fullscreenControl:true});
    m.setCenter(64.5,41.3,5);
  });
  var pLink = ui.Map.Linker([pLeft,pRight]);
  var pPair = ui.Panel([],ui.Panel.Layout.flow('horizontal'),{stretch:'both'});
  var pCanvas = ui.Panel([pLeft],ui.Panel.Layout.flow('horizontal'),{stretch:'both'});
  var pSide = ui.Panel({style:{width:'300px',padding:'12px',backgroundColor:'#f8fafc'}});
  var pShell = ui.Panel([pSide,pCanvas],ui.Panel.Layout.flow('horizontal'),{stretch:'both'});
  var pLegend = ui.Panel(), pDetails = ui.Panel();
  var pTitleL = ui.Label('',{position:'top-left',fontWeight:'bold',padding:'6px 10px',backgroundColor:'ffffff'});
  var pTitleR = ui.Label('2023 | QA0',{position:'top-left',fontWeight:'bold',padding:'6px 10px',backgroundColor:'ffffff'});
  pLeft.add(pTitleL);pRight.add(pTitleR);
  function pLabel(text){return ui.Label(text,{fontSize:'12px',color:'#475569',margin:'4px 0 8px 0'});}
  pSide.add(ui.Button({label:'← Asosiy geoportal',onClick:function(){
    pCanvas.clear();pPair.clear();ui.root.widgets().reset(pOriginal);
  },style:{stretch:'horizontal',fontWeight:'bold'}}));
  pSide.add(ui.Label('TAHLILLAR',{fontWeight:'bold',fontSize:'19px',color:'#183b68'}));
  pSide.add(pLabel('VIIRS Black Marble · O‘zbekiston · v1.0.0'));
  var pItems=['Tadqiqot hududi','Radians — 2020','Radians — 2023','2020 | 2023 taqqoslash',
    'Yorug‘lik o‘tishlari','Qabul qilingan kunlar','Mavsumiy qamrov, %','Tashqi taqqoslash — 2024','Sezgirlik — qayta hisoblash','Cheklovlar va tekshiruv'];
  var pSelect=ui.Select({items:pItems,value:'Radians — 2023',onChange:pRender,style:{stretch:'horizontal'}});
  pSide.add(pSelect);
  pSide.add(pLabel('Asosiy monitoring: gap-filled NTL. Ushbu bo‘lim: muzlatilgan QA0 yillik natijalar. Ikki usul natijalarini bevosita aralashtirmang.'));
  pSide.add(ui.Label('Ochiq kod va natijalar',{fontSize:'12px'},'https://github.com/boymurodovrifat-lang/viirs-geoportal'));
  pSide.add(ui.Button({label:'O‘zbekiston bo‘yicha ko‘rsatish',onClick:function(){pLeft.setCenter(64.5,41.3,5);},style:{stretch:'horizontal'}}));
  pSide.add(pLegend);pSide.add(pDetails);
  pSide.add(pLabel('Manba: NASA/VIIRS/002/VNP46A2; muzlatilgan yillik QA0 tasvirlari. Chegaralar — tadqiqotda ishlatilgan 14 hudud asseti.'));
  pSide.add(ui.Label('stat.uz: turizm, 2024',{fontSize:'11px'},'https://stat.uz/img/news/razvitie-turizma-i-otdykha_p88218.pdf'));
  function pSwatch(color,label){pLegend.add(ui.Panel([
    ui.Label('',{backgroundColor:'#'+color,padding:'8px',margin:'2px 8px 2px 0'}),
    ui.Label(label,{fontSize:'11px',margin:'2px 0',stretch:'horizontal'})],ui.Panel.Layout.flow('horizontal')));}
  function pRamp(palette,caption,ticks){
    pLegend.add(ui.Label(caption,{fontWeight:'bold',fontSize:'12px',margin:'12px 0 4px 0'}));
    pLegend.add(ui.Thumbnail({image:ee.Image.pixelLonLat().select(0),
      params:{bbox:[0,0,1,0.1],dimensions:'260x18',format:'png',min:0,max:1,palette:palette},
      style:{width:'260px',height:'18px',margin:'0'}}));
    pLegend.add(ui.Label(ticks,{fontSize:'11px',margin:'4px 0 8px 0'}));
  }
  function pBoundary(m){m.addLayer(pRegions.style({color:'94a3b8',fillColor:'00000000',width:1}),{},'14 hudud chegaralari');}
  function pRadiance(m,img,year){
    m.addLayer(pDomain,{min:0,max:1,palette:['b9c5d0','b9c5d0']},'Umumiy qamrovdan tashqari');
    // Clamp zero to lower display endpoint; zero is observed, not missing.
    m.addLayer(img.max(0.05).log10().updateMask(pCommon),
      {min:Math.log(0.05)/Math.LN10,max:Math.log(50)/Math.LN10,palette:pPal.magma},
      year+' QA0 | log radians'); pBoundary(m);
  }
  function pRender(){
    var choice=pSelect.getValue();pLegend.clear();pDetails.clear();
    pLeft.layers().reset([]);pRight.layers().reset([]);pCanvas.clear();pPair.clear();
    // Detach maps before moving between single-map and paired-map containers.
    if(choice==='2020 | 2023 taqqoslash'){
      pPair.add(pLeft);pPair.add(pRight);pCanvas.add(pPair);pTitleL.setValue('2020 | QA0');
      pRadiance(pLeft,pQ20,'2020');pRadiance(pRight,pQ23,'2023');
    }else{pCanvas.add(pLeft);pTitleL.setValue(choice);}
    if(choice.indexOf('Radians')===0 || choice==='2020 | 2023 taqqoslash'){
      if(choice!=='2020 | 2023 taqqoslash')pRadiance(pLeft,choice==='Radians — 2020'?pQ20:pQ23,choice==='Radians — 2020'?'2020':'2023');
      pRamp(pPal.magma,'Radians · nW cm⁻² sr⁻¹ · log shkala','≤0.05 · 0.1 · 0.5 · 1 · 5 · 10 · ≥50');
      pSwatch('b9c5d0','Birgalikdagi qamrovga kirmagan');
      pDetails.add(pLabel('Ikkala yil uchun bir xil rang shkalasi. QA0: har ikki yilda ≥30 qabul qilingan kun. Umumiy qamrov: 97.35%.'));
    }else if(choice==='Tadqiqot hududi'){
      pLeft.addLayer(pRegions.style({color:'64748b',fillColor:'e8edf2',width:1}),{},'Tadqiqot hududi');
      pLeft.addLayer(pFocal.style({color:'1d4ed8',fillColor:'93c5fd',width:2}),{},'To‘rtta asosiy hudud');
      pSwatch('93c5fd','Toshkent shahri, Samarqand, Buxoro, Xorazm');
      pDetails.add(pLabel('Arxivlangan tahlil chegaralari. Huquqiy yoki kadastr chegaralarini tasdiqlamaydi.'));
    }else if(choice==='Yorug‘lik o‘tishlari'){
      pLeft.addLayer(pTransitions,{min:0,max:4,palette:pColors},'2020 → 2023 | τ = 1');pBoundary(pLeft);
      pLegend.add(ui.Label('2020 → 2023 · τ = 1 nW cm⁻² sr⁻¹',{fontWeight:'bold',fontSize:'12px'}));
      ['Har ikki yilda ≤1','Har ikki yilda >1','≤1 dan >1 ga o‘tgan','>1 dan ≤1 ga o‘tgan','Umumiy qamrovdan tashqari'].forEach(function(t,i){pSwatch(pColors[i],t);});
      pDetails.add(pLabel('Earth Engine maydon hisobi. Yuqoriga o‘tish: 13 643.5 km². Pastga o‘tish: 321.7 km². Sof farq: +13 321.8 km². Bu radians o‘tishi; qurilish yoki turizm maydoni emas.'));
    }else if(choice==='Qabul qilingan kunlar'){
      pLeft.addLayer(pMin.clipToCollection(pRegions),{min:0,max:300,palette:pPal.viridis},'min(QA0 kunlar 2020, 2023)');pBoundary(pLeft);
      pRamp(pPal.viridis,'Ikki yildagi minimal QA0 kunlari','0 · 60 · 120 · 180 · 240 · ≥300');
      pDetails.add(pLabel('Har bir pikselda ikki yildagi qabul qilingan kunlarning kichigi. Bu kuzatuv mavjudligi, aniqlik ko‘rsatkichi emas.'));
    }else if(choice==='Mavsumiy qamrov, %'){
      pLeft.addLayer(pSeasonImage,{min:0,max:100,palette:pPal.YlGnBu},'Hududda saqlangan maydon, %');
      pLeft.addLayer(pSeasonal.selfMask(),{palette:['21a59b']},'Mavsumiy mezondan o‘tgan piksellar',false);pBoundary(pLeft);
      pRamp(pPal.YlGnBu,'Mavsumiy mezonda saqlangan maydon, %','0 · 20 · 40 · 60 · 80 · 100');
      pDetails.add(pLabel('Har ikki yilda ≥30 kun va ≥9 oyda har oy ≥5 QA0 kun. Respublika bo‘yicha: 93.19%. Hudud foizlari v0.5 arxiv CSV faylidan.'));
    }else if(choice==='Sezgirlik — qayta hisoblash'){
      pLeft.addLayer(pRegions.style({color:'64748b',fillColor:'e8edf2',width:1}),{},'Tahlil hududi');
      var pSensitivity=ee.FeatureCollection([{"scenario": "τ = 0.5", "change_pct": 176.1434905916583}, {"scenario": "τ = 1", "change_pct": 82.15684186496914}, {"scenario": "τ = 2", "change_pct": 64.79707174353226}, {"scenario": "τ = 3", "change_pct": 57.9733034377619}, {"scenario": "Ustyurt: ikki yil foni", "change_pct": 45.81693446401598}, {"scenario": "Qizilqum g‘arb: ikki yil foni", "change_pct": 46.30590448408025}, {"scenario": "Qizilqum janub: ikki yil foni", "change_pct": 46.28496796181996}].map(function(r){return ee.Feature(null,r);}));
      pDetails.add(ui.Chart.feature.byFeature(pSensitivity,'scenario',['change_pct']).setChartType('ColumnChart').setOptions({title:'2020–2023: chegaradan yuqori maydon o‘zgarishi',legend:{position:'none'},vAxis:{title:'O‘zgarish, %'},hAxis:{slantedText:true,slantedTextAngle:60},height:300,colors:['#21a59b']}));
      pDetails.add(pLabel('Muzlatilgan v13 oflayn qayta hisoblash: umumiy qamrov 437 587.25 km²; τ=1 uchun +82.16%. Ikki yil fonini ayirish stsenariylari +45.82–46.31%. Bu fon tuzatishi ssenariysi, tasdiqlangan kalibrlash emas.'));
      pDetails.add(pLabel('Xaritadagi Earth Engine maydon hisoblari boshqa maydon integratsiyasiga ega. Oflayn va EE sonlari orasidagi farq hali to‘liq yarashtirilmagan; ushbu diagramma yangi piksel xaritasi emas.'));
    }else if(choice==='Cheklovlar va tekshiruv'){
      pLeft.addLayer(pRegions.style({color:'64748b',fillColor:'e8edf2',width:1}),{},'Tahlil hududi');
      pDetails.add(pLabel('Mustaqil tungi dala validatsiyasi hali bajarilmagan. Turizm statistikasi tashqi taqqoslash bo‘lib, tungi yorug‘likning aniqligini tasdiqlamaydi.'));
      pDetails.add(pLabel('2013–2025 fon qatorlarida uch yillik 10 ta farqning har bir oynada 5 tasi musbat, 5 tasi manfiy. 2020–2023 eng katta musbat farq; u umumiy chiziqli trendni isbotlamaydi.'));
      pDetails.add(pLabel('Oy yorug‘ligi va ko‘rish burchagi bo‘yicha guruhlashda farq taxminan 0.185–0.210 nW cm⁻² sr⁻¹ gacha kamayadi; saqlangan kuzatuv ulushi 26.3–40.8%. Qoldiq ta’sirlar to‘liq bartaraf etilmagan.'));
      pDetails.add(pLabel('Qayta hisoblash tekshiruvi: 42 manba xeshi; 384 piksel-yil o‘rtachasi eng katta farqi 1.48×10⁻⁸; kunlar soni farqi 0. Bu hisoblash izchilligi, mustaqil aniqlik bahosi emas.'));
    }else{
      pLeft.addLayer(pRegions.style({color:'64748b',fillColor:'e8edf2',width:1}),{},'14 ta taqqoslash hududi');
      pDetails.add(ui.Chart.feature.byFeature(pTourFC,'qa_mean_full',['persons_thousand']).setChartType('ScatterChart').setOptions({
        title:'2024: radians va joylashtirilgan shaxslar',legend:{position:'none'},
        hAxis:{title:'QA0 radians (nW cm⁻² sr⁻¹)'},vAxis:{title:'Shaxslar, ming'},pointSize:5,colors:['#21a59b'],height:220}));
      pDetails.add(ui.Chart.feature.byFeature(pTourFC,'beds',['persons_thousand']).setChartType('ScatterChart').setOptions({
        title:'2024: o‘rinlar va joylashtirilgan shaxslar',legend:{position:'none'},
        hAxis:{title:'Joylashtirish o‘rinlari'},vAxis:{title:'Shaxslar, ming'},pointSize:5,colors:['#344c69'],height:220}));
      pDetails.add(pLabel('n=14. Spearman: radians–shaxslar 0.380; o‘rinlar–shaxslar 0.934. NTL qo‘shilishi prognoz sifatini izchil yaxshilamadi. Sababiy bog‘liqlik yoki turizm validatsiyasi sifatida talqin qilinmaydi.'));
    }
  }
  panel.widgets().insert(1,ui.Button({label:'🗺 Tahlillar · 2020–2023',onClick:function(){
    ui.root.widgets().reset([pShell]);pRender();
  },style:{stretch:'horizontal',fontWeight:'bold',color:'#183b68'}}));
  // Main portal remains the initial view, retaining geometry, dates and charts.
  print('TAHLILLAR_V1_READY','Asosiy geoportal → Tahlillar');
})();

