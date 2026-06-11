let mode = 'hot', di = 0;
let countyData = null;
let proj = null;

const YEARS = d3.range(1950, 2020);

function clampFloatLabel(label, x, y) {
  if (!label) return;
  const pad = 14;
  const rect = label.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let nx = x;
  let ny = y;
  if (nx + rect.width + pad > vw) nx = vw - rect.width - pad;
  if (ny + rect.height + pad > vh) ny = vh - rect.height - pad;
  if (nx < pad) nx = pad;
  if (ny < pad) ny = pad;
  label.style.left = nx + 'px';
  label.style.top = ny + 'px';
}

const SVG_W = 480, SVG_H = 620;

const SCALES = {
  hot: {
    title: 'Max temp (°C)',
    lo: 15,
    hi: 50,
    loLabel: '15°C',
    hiLabel: '50°C',
    fn: v => {
      const t = Math.max(0, Math.min(1, (v - 15) / 35));
      return d3.interpolateYlOrRd(t);
    }
  },

  cold: {
    title: 'Min temp (°C)',
    lo: -10,
    hi: 15,
    loLabel: '-10°C',
    hiLabel: '15°C',
    fn: v => {
      const t = Math.max(0, Math.min(1, (v + 10) / 25));
      return d3.interpolateBlues(1 - t);
    }
  },

  range: {
    title: 'Temp range °C (hot−cold)',
    lo: 0,
    hi: 30,
    loLabel: '0°C',
    hiLabel: '30°C',
    fn: v => {
      const t = Math.max(0, Math.min(1, (v - 0) / 30));
      return d3.interpolatePuRd(t);
    }
  }
};

function getVal(county, m, i) {
  if (m === 'hot')  return county.hot[i];
  if (m === 'cold') return county.cold[i];
  return (county.hot[i] !== null && county.cold[i] !== null)
    ? parseFloat((county.hot[i] - county.cold[i]).toFixed(1))
    : null;
}

function colorOf(v, m) {
  if (v === null) return 'rgba(190,235,255,0.22)';
  return SCALES[m].fn(v);
}

function drawLegend(m) {
  const cfg = SCALES[m];
  document.getElementById('leg-title').textContent = cfg.title;
  document.getElementById('leg-lo').textContent    = cfg.loLabel;
  document.getElementById('leg-hi').textContent    = cfg.hiLabel;

  const canvas = document.getElementById('legend-bar');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  for (let x = 0; x < W; x++) {
    const v = cfg.lo + (x / W) * (cfg.hi - cfg.lo);
    ctx.fillStyle = cfg.fn(v);
    ctx.fillRect(x, 0, 1, H);
  }
}

function render() {
  if (!countyData) return;

  d3.selectAll('.county-shape')
    .transition().duration(300)
    .attr('fill', function() {
      const d = d3.select(this).datum();
      const name = d.properties.name;
      const cd = countyData.counties[name];
      if (!cd) return 'rgba(190,235,255,0.42)';
      return colorOf(getVal(cd, mode, di), mode);
    });

  drawLegend(mode);
}

function buildMap(countiesGeoJSON) {
  proj = d3.geoMercator().fitSize([SVG_W, SVG_H], countiesGeoJSON);
  const pathGen = d3.geoPath(proj);

  const svg = d3.select('#ca-svg');
  svg.selectAll('*').remove();

  const floatLabel = document.getElementById('float-label');
  const mapWrap    = document.getElementById('map-wrap');

  const MODE_YDOMAIN = {
    hot:   [15, 45],
    cold:  [-10, 15],
    range: [0, 40]
  };

  const sidePanel = document.getElementById('hovered-panel');
  sidePanel.style.cssText = 'padding:0;';

  const SP_W = 220, SP_H = 145;
  const SP_M = { top: 10, right: 8, bottom: 22, left: 32 };
  const SP_IW = SP_W - SP_M.left - SP_M.right;
  const SP_IH = SP_H - SP_M.top  - SP_M.bottom;

  sidePanel.innerHTML =
    '<div id="sp-title" style="font-size:11px;font-weight:700;color:#eaf8ff;padding:6px 8px 2px;"></div>' +
    '<svg id="sp-svg" width="' + SP_W + '" height="' + SP_H + '" viewBox="0 0 ' + SP_W + ' ' + SP_H + '" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible;width:100%;height:auto;"></svg>' +
    '<div id="sp-legend" style="padding:4px 8px 6px;font-size:9px;line-height:1.7;"></div>' +
    '<div id="sp-hint" style="padding:0 8px 6px;font-size:9px;color:#89a6b7;">Click a county to pin it. Click again to remove.</div>';

  const spSvg = d3.select('#sp-svg');
  const spG   = spSvg.append('g').attr('transform', 'translate(' + SP_M.left + ',' + SP_M.top + ')');

  const spXAxisG = spG.append('g').attr('transform', 'translate(0,' + SP_IH + ')');
  const spYAxisG = spG.append('g');
  const spGridG  = spG.append('g');
  const spYearG  = spG.append('line')
    .attr('y1', 0).attr('y2', SP_IH)
    .attr('stroke', 'rgba(234,248,255,0.72)').attr('stroke-width', 1).attr('stroke-dasharray', '3,2').attr('opacity', 0);
  const spLinesG = spG.append('g');
  const spHoverG = spG.append('g');

  const xSp = d3.scaleLinear().domain([YEARS[0], YEARS[YEARS.length - 1]]).range([0, SP_IW]);
  let ySp = d3.scaleLinear().domain(MODE_YDOMAIN[mode]).range([SP_IH, 0]);

  const COUNTY_COLORS = [
    '#e6194b','#3cb44b','#4363d8','#f58231','#911eb4',
    '#42d4f4','#f032e6','#bfef45','#fabed4','#469990',
    '#dcbeff','#9A6324','#fffac8','#800000','#aaffc3'
  ];
  let colorIdx = 0;
  const countyColorMap = new Map();

  function getCountyColor(name) {
    if (!countyColorMap.has(name)) {
      countyColorMap.set(name, COUNTY_COLORS[colorIdx % COUNTY_COLORS.length]);
      colorIdx++;
    }
    return countyColorMap.get(name);
  }

  function buildSpAxes() {
    ySp = d3.scaleLinear().domain(MODE_YDOMAIN[mode]).range([SP_IH, 0]);
    spXAxisG.call(d3.axisBottom(xSp).ticks(7).tickFormat(d3.format('d')))
      .call(g => g.select('.domain').attr('stroke','rgba(190,235,255,0.42)'))
      .call(g => g.selectAll('line').attr('stroke','rgba(190,235,255,0.42)'))
      .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.72)').style('font-size','10px'));
    spYAxisG.call(d3.axisLeft(ySp).ticks(5).tickFormat(d => d + '°'))
      .call(g => g.select('.domain').attr('stroke','rgba(190,235,255,0.42)'))
      .call(g => g.selectAll('line').attr('stroke','rgba(190,235,255,0.42)'))
      .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.72)').style('font-size','10px'));
    const yDom = MODE_YDOMAIN[mode];
    const step = (yDom[1] - yDom[0]) / 5;
    spGridG.selectAll('line').remove();
    spGridG.selectAll('line')
      .data(d3.range(yDom[0], yDom[1] + step * 0.1, step))
      .join('line')
      .attr('x1', 0).attr('x2', SP_IW)
      .attr('y1', t => ySp(t)).attr('y2', t => ySp(t))
      .attr('stroke', 'rgba(190,235,255,0.10)').attr('stroke-width', 0.8);
    document.getElementById('sp-title').textContent = SCALES[mode].title + '  ·  1950–2019';
  }
  buildSpAxes();

  const selectedCounties = new Map();

  function countySeriesVals(name) {
    const cd = countyData.counties[name];
    if (!cd) return YEARS.map(() => null);
    return YEARS.map((yr, i) => getVal(cd, mode, i));
  }

  function countyPathD(name, color) {
    const vals = countySeriesVals(name);
    const lineGen = d3.line()
      .x((v, i) => xSp(YEARS[i]))
      .y(v => ySp(v))
      .defined(v => v !== null)
      .curve(d3.curveCatmullRom.alpha(0.5));
    return lineGen(vals);
  }

  function redrawPinnedLines() {
    buildSpAxes();
    spLinesG.selectAll('*').remove();
    selectedCounties.forEach((color, name) => {
      spLinesG.append('path')
        .attr('d', countyPathD(name, color))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('opacity', 0.9);
    });
    updateYearLine();
    updateLegend();
  }

  function updateYearLine() {
    const cx = xSp(YEARS[di]);
    spYearG.attr('x1', cx).attr('x2', cx)
      .attr('opacity', selectedCounties.size > 0 ? 0.7 : 0);
    spLinesG.selectAll('circle.year-dot').remove();
    selectedCounties.forEach((color, name) => {
      const vals = countySeriesVals(name);
      const v = vals[di];
      if (v === null) return;
      spLinesG.append('circle').attr('class', 'year-dot')
        .attr('cx', xSp(YEARS[di])).attr('cy', ySp(v))
        .attr('r', 3.5).attr('fill', color)
        .attr('stroke', '#fff').attr('stroke-width', 1.2);
    });
  }

  function updateLegend() {
    const leg = document.getElementById('sp-legend');
    if (selectedCounties.size === 0) { leg.innerHTML = ''; return; }
    leg.innerHTML = Array.from(selectedCounties.entries()).map(([name, color]) =>
      '<div style="display:flex;align-items:center;gap:5px;">' +
      '<span style="display:inline-block;width:16px;height:3px;background:' + color + ';border-radius:2px;flex-shrink:0;"></span>' +
      '<span style="color:#dceff8;">' + name + '</span>' +
      '</div>'
    ).join('');
  }

  const countyGroup = svg.append('g');

  countyGroup.selectAll('path.county-shape')
    .data(countiesGeoJSON.features)
    .join('path')
      .attr('class', 'county-shape')
      .attr('d', pathGen)
      .attr('fill', d => {
        const name = d.properties.name;
        const cd = countyData.counties[name];
        if (!cd) return 'rgba(190,235,255,0.42)';
        return colorOf(getVal(cd, mode, di), mode);
      })
      .attr('stroke', 'rgba(255,255,255,0.5)')
      .attr('stroke-width', 0.6)
      .attr('cursor', 'pointer')

      .on('mousemove', function(event, d) {
        const name = d.properties.name;
        const cd = countyData.counties[name];
        if (!cd) return;

        const hot   = cd.hot[di]  !== null ? cd.hot[di].toFixed(1)  + '°C' : 'N/A';
        const cold  = cd.cold[di] !== null ? cd.cold[di].toFixed(1) + '°C' : 'N/A';
        const range = (cd.hot[di] !== null && cd.cold[di] !== null)
          ? (cd.hot[di] - cd.cold[di]).toFixed(1) + '°C' : 'N/A';
        const v = getVal(cd, mode, di);
        const vStr = v !== null ? v.toFixed(1) + '°C' : 'N/A';
        if (window.updateMapScanner) window.updateMapScanner(name, hot, cold, range, vStr);

        floatLabel.innerHTML =
          `<strong style="display:block;margin-bottom:2px;">${name} County</strong>
           <span style="color:#ffb08a;">Max high: ${hot}</span><br>
           <span style="color:#95d4ff;">Min low:  ${cold}</span><br>
           <span style="color:#dfb7ff;">Range:    ${range}</span>
           <hr style="margin:4px 0;border:none;border-top:1px solid rgba(190,235,255,0.16);">
           <strong>${SCALES[mode].title}: ${vStr}</strong>`;

        const rect = mapWrap.getBoundingClientRect();
        let lx = event.clientX - rect.left + 14;
        let ly = event.clientY - rect.top  - 10;
        floatLabel.style.display = 'block';
        if (lx + 175 > mapWrap.offsetWidth) lx = event.clientX - rect.left - 180;
        floatLabel.style.left = lx + 'px';
        floatLabel.style.top  = ly + 'px';

        d3.select(this).attr('stroke', '#ffffff').attr('stroke-width', 1.5);

        spHoverG.selectAll('*').remove();
        if (!selectedCounties.has(name)) {
          const vals = countySeriesVals(name);
          const lineGen = d3.line()
            .x((v, i) => xSp(YEARS[i]))
            .y(v => ySp(v))
            .defined(v => v !== null)
            .curve(d3.curveCatmullRom.alpha(0.5));
          spHoverG.append('path')
            .attr('d', lineGen(vals))
            .attr('fill', 'none')
            .attr('stroke', 'rgba(212,232,242,0.72)')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '5,3')
            .attr('opacity', 0.7);
          const v2 = vals[di];
          if (v2 !== null) {
            spHoverG.append('circle')
              .attr('cx', xSp(YEARS[di])).attr('cy', ySp(v2))
              .attr('r', 3).attr('fill', 'rgba(212,232,242,0.72)').attr('stroke', '#fff').attr('stroke-width', 1);
          }
          document.getElementById('sp-hint').textContent = name + ' County — click to pin';
        } else {
          document.getElementById('sp-hint').textContent = name + ' County — click to remove';
        }
      })
      .on('mouseleave', function(event, d) {
        floatLabel.style.display = 'none';
        if (window.resetMapScanner) window.resetMapScanner();
        spHoverG.selectAll('*').remove();
        document.getElementById('sp-hint').textContent = 'Click a county to pin it. Click again to remove.';
        const name = d.properties.name;
        const isSelected = selectedCounties.has(name);
        d3.select(this)
          .attr('stroke', isSelected ? selectedCounties.get(name) : 'rgba(255,255,255,0.5)')
          .attr('stroke-width', isSelected ? 2 : 0.6);
      })

      .on('click', function(event, d) {
        const name = d.properties.name;
        if (selectedCounties.has(name)) {
          selectedCounties.delete(name);
          countyColorMap.delete(name);
          d3.select(this)
            .attr('stroke', 'rgba(255,255,255,0.5)')
            .attr('stroke-width', 0.6);
        } else {
          const color = getCountyColor(name);
          selectedCounties.set(name, color);
          d3.select(this)
            .attr('stroke', color)
            .attr('stroke-width', 2);
        }
        redrawPinnedLines();
      });

  window._spRedraw      = redrawPinnedLines;
  window._spUpdateYear  = updateYearLine;

  document.getElementById('loading-msg').style.display = 'none';
  document.getElementById('ca-svg').style.display = 'block';
  drawLegend(mode);
}

function setMode(m) {
  mode = m;
  ['hot', 'cold', 'range'].forEach(x => {
    document.getElementById('btn-' + x).className =
      'ctrl-btn' + (x === m ? ' active-' + m : '');
  });
  render();
  if (window._spRedraw) window._spRedraw();
  if (window.updateCityCompare) window.updateCityCompare();
}

function setYear(v) {
  di = v;
  document.getElementById('dec-lbl').textContent = YEARS[di];
  render();
  if (window._spUpdateYear) window._spUpdateYear();
  if (window.updateCityCompare) window.updateCityCompare();
}

Promise.all([
  fetch('https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/california-counties.geojson').then(r => r.json()),
  fetch('ca_county_data.json').then(r => r.json())
])
.then(([countiesGeoJSON, data]) => {
  countyData = data;
  buildMap(countiesGeoJSON);
})
.catch(err => {
  document.getElementById('loading-msg').textContent =
    'Error: ' + err.message +
    ' — Make sure ca_county_data.json is in the same folder as this HTML file, ' +
    'and open via a local server (e.g. python -m http.server 8000), not by double-clicking.';
  document.getElementById('loading-msg').style.color = '#c00';
});

const COLORS = {
    'historical': '#444441',
    'SSP2-4.5':   '#ba7517',
    'SSP5-8.5':   '#a32d2d',
  };

  const BTN_ID = {
    'historical': 'btn-hist',
    'SSP2-4.5':   'btn-s245',
    'SSP5-8.5':   'btn-s585',
  };

  const BTN_CLASS = {
    'historical': 'on-hist',
    'SSP2-4.5':   'on-s245',
    'SSP5-8.5':   'on-s585',
  };

  const scenarios = ['historical', 'SSP2-4.5', 'SSP5-8.5'];
  const visible   = { 'historical': true, 'SSP2-4.5': true, 'SSP5-8.5': true };

  const margin = { top: 20, right: 20, bottom: 45, left: 55 };
  const totalW  = document.getElementById('chart').clientWidth - 32 || 820;
  const totalH  = 420;
  const W = totalW - margin.left - margin.right;
  const H = totalH - margin.top  - margin.bottom;

  const svg = d3.select('#viz')
    .attr('width', totalW)
    .attr('height', totalH)
    .style('overflow', 'visible');

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().domain([1850, 2100]).range([0, W]);
  const yScale = d3.scaleLinear().domain([3, 34]).range([H, 0]);

  g.append('g')
    .attr('class', 'gridline')
    .call(d3.axisLeft(yScale).tickSize(-W).tickFormat(''));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${H})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format('d')).ticks(10));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(8).tickFormat(d => d + '°C'));

  g.append('text')
    .attr('x', W / 2).attr('y', H + 38)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px').attr('fill', '#9bb6c5')
    .text('Year');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -H / 2).attr('y', -42)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px').attr('fill', '#9bb6c5')
    .text('Temperature (°C)');

  g.append('line')
    .attr('class', 'proj-line')
    .attr('x1', xScale(2015)).attr('x2', xScale(2015))
    .attr('y1', 0).attr('y2', H);

  g.append('text')
    .attr('class', 'proj-label')
    .attr('x', xScale(2015) + 4).attr('y', 12)
    .text('projections →');

  const hoverLine = g.append('line')
    .attr('stroke', 'rgba(190,235,255,0.40)')
    .attr('stroke-width', 1)
    .attr('y1', 0).attr('y2', H)
    .attr('opacity', 0)
    .attr('pointer-events', 'none');

  const gData = g.append('g');
  let grouped  = {};

  const areaGen = d3.area()
    .x(d => xScale(d.year))
    .y0(d => yScale(d.min))
    .y1(d => yScale(d.max))
    .curve(d3.curveCatmullRom.alpha(0.5));

  const lineGen = key => d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d[key]))
    .curve(d3.curveCatmullRom.alpha(0.5));

  function drawScenario(s, data) {
    const c   = COLORS[s];
    const cls = s.replace(/[\.\-]/g, '_');

    gData.append('path')
      .datum(data)
      .attr('class', `band band-${cls}`)
      .attr('fill', c)
      .attr('opacity', 0.12)
      .attr('d', areaGen);

    ['min', 'max'].forEach(k => {
      gData.append('path')
        .datum(data)
        .attr('class', `line-ext line-${cls}`)
        .attr('stroke', c)
        .attr('d', lineGen(k));
    });

    gData.append('path')
      .datum(data)
      .attr('class', `line-mean line-${cls}`)
      .attr('stroke', c)
      .attr('d', lineGen('mean'));
  }

  const tooltip = document.getElementById('tooltip');
  const bisect  = d3.bisector(d => d.year).left;
  let hideTimer;

  function showTooltip(event, year) {
    document.getElementById('tt-year').textContent = year;

    let html = '';
    scenarios.forEach(s => {
      if (!visible[s] || !grouped[s]) return;
      const arr = grouped[s];
      const i   = bisect(arr, year, 1);
      const d   = arr[Math.min(i, arr.length - 1)];
      if (!d) return;
      const c = COLORS[s];
      html += `
        <div class="tt-block" style="border-left:3px solid ${c};">
          <div class="label">${s}</div>
          <div class="tt-row"><span>Max</span><span>${d.max.toFixed(1)}°C</span></div>
          <div class="tt-row"><span>Mean</span><span>${d.mean.toFixed(1)}°C</span></div>
          <div class="tt-row"><span>Min</span><span>${d.min.toFixed(1)}°C</span></div>
        </div>`;
    });

    document.getElementById('tt-content').innerHTML = html;
    tooltip.style.opacity = '1';

    const ttW  = tooltip.offsetWidth;
    const ttH  = tooltip.offsetHeight;
    let left   = event.clientX + 18;
    let top    = event.clientY - 20;
    if (left + ttW > window.innerWidth  - 10) left = event.clientX - ttW - 18;
    if (top  + ttH > window.innerHeight - 10) top  = window.innerHeight - ttH - 10;

    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }

  function hideTooltip() {
    hideTimer = setTimeout(() => {
      hoverLine.attr('opacity', 0);
      tooltip.style.opacity = '0';
    }, 120);
  }

  const overlay = g.append('rect')
    .attr('width', W)
    .attr('height', H)
    .attr('fill', 'none')
    .attr('pointer-events', 'all');

  overlay.on('mousemove', function(event) {
    clearTimeout(hideTimer);
    const [mx] = d3.pointer(event);
    const year  = Math.round(xScale.invert(mx));
    hoverLine.attr('x1', mx).attr('x2', mx).attr('opacity', 1);
    showTooltip(event, year);
  });

  overlay.on('mouseleave', hideTooltip);

  function toggleScenario(s) {
    visible[s]  = !visible[s];
    const cls   = s.replace(/[\.\-]/g, '_');

    d3.selectAll(`.band-${cls}`).attr('opacity', visible[s] ? 0.12 : 0);
    d3.selectAll(`.line-${cls}`).attr('opacity', visible[s] ? 1    : 0);

    const btn = document.getElementById(BTN_ID[s]);
    if (visible[s]) btn.classList.add(BTN_CLASS[s]);
    else            btn.classList.remove(BTN_CLASS[s]);
  }

  d3.csv('sd_extremes.csv', d => ({
    year:     +d.year,
    min:      +d.min,
    mean:     +d.mean,
    max:      +d.max,
    scenario:  d.scenario,
  })).then(data => {
    scenarios.forEach(s => {
      grouped[s] = data
        .filter(d => d.scenario === s)
        .sort((a, b) => a.year - b.year);
      drawScenario(s, grouped[s]);
    });

    hoverLine.raise();
    overlay.raise();
  });

  const sstData = [{"year":1950,"val":18.847788},{"year":1951,"val":18.955421},{"year":1952,"val":18.911663},{"year":1953,"val":18.797586},{"year":1954,"val":18.783888},{"year":1955,"val":18.354391},{"year":1956,"val":18.415876},{"year":1957,"val":18.270643},{"year":1958,"val":18.844719},{"year":1959,"val":18.138975},{"year":1960,"val":19.025873},{"year":1961,"val":18.26248},{"year":1962,"val":18.982752},{"year":1963,"val":18.336794},{"year":1964,"val":18.133081},{"year":1965,"val":17.991058},{"year":1966,"val":18.570555},{"year":1967,"val":17.738407},{"year":1968,"val":18.395079},{"year":1969,"val":18.200417},{"year":1970,"val":18.067045},{"year":1971,"val":18.828825},{"year":1972,"val":18.723267},{"year":1973,"val":18.692635},{"year":1974,"val":18.499609},{"year":1975,"val":18.915903},{"year":1976,"val":18.428335},{"year":1977,"val":18.136103},{"year":1978,"val":19.253567},{"year":1979,"val":18.556625},{"year":1980,"val":18.631596},{"year":1981,"val":18.473883},{"year":1982,"val":17.918966},{"year":1983,"val":18.170456},{"year":1984,"val":18.45537},{"year":1985,"val":19.035368},{"year":1986,"val":18.962555},{"year":1987,"val":18.964952},{"year":1988,"val":17.967646},{"year":1989,"val":18.49156},{"year":1990,"val":18.749702},{"year":1991,"val":18.34363},{"year":1992,"val":17.705574},{"year":1993,"val":17.726017},{"year":1994,"val":18.80072},{"year":1995,"val":18.560776},{"year":1996,"val":18.648369},{"year":1997,"val":19.751425},{"year":1998,"val":18.679195},{"year":1999,"val":18.656536},{"year":2000,"val":18.990366},{"year":2001,"val":19.085474},{"year":2002,"val":18.703676},{"year":2003,"val":19.127237},{"year":2004,"val":19.653294},{"year":2005,"val":19.419685},{"year":2006,"val":19.274931},{"year":2007,"val":18.837313},{"year":2008,"val":19.20241},{"year":2009,"val":18.93244},{"year":2010,"val":18.427925},{"year":2011,"val":19.206192},{"year":2012,"val":18.91688},{"year":2013,"val":18.973394},{"year":2014,"val":19.437723}];
  const landTempData = [{"year":1950,"val":16.731812},{"year":1951,"val":16.58722},{"year":1952,"val":16.700989},{"year":1953,"val":16.699982},{"year":1954,"val":16.26007},{"year":1955,"val":16.268372},{"year":1956,"val":16.438171},{"year":1957,"val":15.465515},{"year":1958,"val":16.604248},{"year":1959,"val":15.809814},{"year":1960,"val":15.979065},{"year":1961,"val":15.916138},{"year":1962,"val":16.442688},{"year":1963,"val":15.341705},{"year":1964,"val":15.706909},{"year":1965,"val":15.585175},{"year":1966,"val":16.113281},{"year":1967,"val":15.273499},{"year":1968,"val":15.988525},{"year":1969,"val":15.856171},{"year":1970,"val":15.271667},{"year":1971,"val":15.740784},{"year":1972,"val":16.156738},{"year":1973,"val":16.420563},{"year":1974,"val":15.886353},{"year":1975,"val":16.114807},{"year":1976,"val":15.524231},{"year":1977,"val":16.065979},{"year":1978,"val":16.693024},{"year":1979,"val":16.29248},{"year":1980,"val":16.0401},{"year":1981,"val":17.133545},{"year":1982,"val":15.816101},{"year":1983,"val":15.88208},{"year":1984,"val":16.487854},{"year":1985,"val":16.809753},{"year":1986,"val":17.091217},{"year":1987,"val":16.433289},{"year":1988,"val":15.642517},{"year":1989,"val":16.450928},{"year":1990,"val":16.496918},{"year":1991,"val":15.853333},{"year":1992,"val":14.774109},{"year":1993,"val":14.935486},{"year":1994,"val":16.560669},{"year":1995,"val":15.57663},{"year":1996,"val":16.79068},{"year":1997,"val":17.437347},{"year":1998,"val":15.908203},{"year":1999,"val":16.430267},{"year":2000,"val":16.509033},{"year":2001,"val":17.086487},{"year":2002,"val":16.534668},{"year":2003,"val":17.645508},{"year":2004,"val":17.064514},{"year":2005,"val":16.785278},{"year":2006,"val":17.031952},{"year":2007,"val":16.633179},{"year":2008,"val":17.29181},{"year":2009,"val":17.513306},{"year":2010,"val":16.561768},{"year":2011,"val":16.582703},{"year":2012,"val":16.366669},{"year":2013,"val":17.081757},{"year":2014,"val":17.421814}];
  const slhData = [{"year":1950,"val":0.175331},{"year":1951,"val":0.176746},{"year":1952,"val":0.179152},{"year":1953,"val":0.162771},{"year":1954,"val":0.165186},{"year":1955,"val":0.151643},{"year":1956,"val":0.163673},{"year":1957,"val":0.164551},{"year":1958,"val":0.165047},{"year":1959,"val":0.162105},{"year":1960,"val":0.192434},{"year":1961,"val":0.161946},{"year":1962,"val":0.172243},{"year":1963,"val":0.16915},{"year":1964,"val":0.17509},{"year":1965,"val":0.151453},{"year":1966,"val":0.179205},{"year":1967,"val":0.159309},{"year":1968,"val":0.168275},{"year":1969,"val":0.179525},{"year":1970,"val":0.187908},{"year":1971,"val":0.164632},{"year":1972,"val":0.179788},{"year":1973,"val":0.169347},{"year":1974,"val":0.185801},{"year":1975,"val":0.198483},{"year":1976,"val":0.186294},{"year":1977,"val":0.15979},{"year":1978,"val":0.186574},{"year":1979,"val":0.191077},{"year":1980,"val":0.160828},{"year":1981,"val":0.152484},{"year":1982,"val":0.16478},{"year":1983,"val":0.153014},{"year":1984,"val":0.155427},{"year":1985,"val":0.159615},{"year":1986,"val":0.170908},{"year":1987,"val":0.169747},{"year":1988,"val":0.143189},{"year":1989,"val":0.162776},{"year":1990,"val":0.162232},{"year":1991,"val":0.167535},{"year":1992,"val":0.167655},{"year":1993,"val":0.145281},{"year":1994,"val":0.170093},{"year":1995,"val":0.160766},{"year":1996,"val":0.156362},{"year":1997,"val":0.169275},{"year":1998,"val":0.153876},{"year":1999,"val":0.145222},{"year":2000,"val":0.173107},{"year":2001,"val":0.147102},{"year":2002,"val":0.143168},{"year":2003,"val":0.165588},{"year":2004,"val":0.173648},{"year":2005,"val":0.163664},{"year":2006,"val":0.157969},{"year":2007,"val":0.173517},{"year":2008,"val":0.148391},{"year":2009,"val":0.136215},{"year":2010,"val":0.152612},{"year":2011,"val":0.168473},{"year":2012,"val":0.145272},{"year":2013,"val":0.151176},{"year":2014,"val":0.159727}];
  const precData = [{"year":1950,"val":10.517476},{"year":1951,"val":22.533314},{"year":1952,"val":29.61352},{"year":1953,"val":25.530426},{"year":1954,"val":17.711868},{"year":1955,"val":14.568308},{"year":1956,"val":17.862043},{"year":1957,"val":32.397747},{"year":1958,"val":27.569826},{"year":1959,"val":17.107075},{"year":1960,"val":53.721924},{"year":1961,"val":17.882051},{"year":1962,"val":34.88263},{"year":1963,"val":21.42847},{"year":1964,"val":25.075737},{"year":1965,"val":20.825426},{"year":1966,"val":19.09234},{"year":1967,"val":35.935642},{"year":1968,"val":17.177631},{"year":1969,"val":31.371763},{"year":1970,"val":25.745665},{"year":1971,"val":41.23936},{"year":1972,"val":11.860513},{"year":1973,"val":25.995232},{"year":1974,"val":39.53982},{"year":1975,"val":22.32207},{"year":1976,"val":34.736317},{"year":1977,"val":18.154613},{"year":1978,"val":28.627535},{"year":1979,"val":16.424133},{"year":1980,"val":23.856125},{"year":1981,"val":13.422541},{"year":1982,"val":28.46263},{"year":1983,"val":8.822854},{"year":1984,"val":26.684551},{"year":1985,"val":20.851217},{"year":1986,"val":15.051625},{"year":1987,"val":39.510345},{"year":1988,"val":18.458532},{"year":1989,"val":25.451447},{"year":1990,"val":31.221346},{"year":1991,"val":38.942192},{"year":1992,"val":22.941633},{"year":1993,"val":32.15495},{"year":1994,"val":37.39265},{"year":1995,"val":39.74014},{"year":1996,"val":17.62959},{"year":1997,"val":24.444412},{"year":1998,"val":26.670668},{"year":1999,"val":16.304955},{"year":2000,"val":27.638268},{"year":2001,"val":19.928637},{"year":2002,"val":18.1967},{"year":2003,"val":22.7084},{"year":2004,"val":42.851234},{"year":2005,"val":23.997492},{"year":2006,"val":30.917273},{"year":2007,"val":35.764683},{"year":2008,"val":19.752129},{"year":2009,"val":10.984967},{"year":2010,"val":24.685053},{"year":2011,"val":34.61365},{"year":2012,"val":27.787498},{"year":2013,"val":19.172424},{"year":2014,"val":22.552126}];
  const years = sstData.map(d => d.year);
  const sstVals = sstData.map(d => d.val);
  const slhVals = slhData.map(d => d.val);
  const precVals = precData.map(d => d.val);
  const sstMean = d3.mean(sstVals), slhMean = d3.mean(slhVals), precMean = d3.mean(precVals);

  function pct(v, arr) { return ((v - d3.min(arr)) / (d3.max(arr) - d3.min(arr)) * 100).toFixed(1); }
  function norm(v, arr) { return (v - d3.min(arr)) / (d3.max(arr) - d3.min(arr)); }
  function deltaClass(diff, threshold) { return diff > threshold ? 'up' : diff < -threshold ? 'down' : 'same'; }
  function deltaText(diff, decimals, unit) { return (diff >= 0 ? '▲ +' : '▼ ') + Math.abs(diff).toFixed(decimals) + ' ' + unit + ' vs average'; }

  const hm = { top:16, right:18, bottom:34, left:46 };
  const hW = 860 - hm.left - hm.right;
  const hH = 220 - hm.top - hm.bottom;
  const hSvg = d3.select('#histSvg').append('g').attr('transform', `translate(${hm.left},${hm.top})`);
  const xH = d3.scaleLinear().domain(d3.extent(years)).range([0, hW]);
  const yH = d3.scaleLinear().domain([0, 1]).range([hH, 0]);

  hSvg.append('g').attr('transform', `translate(0,${hH})`)
    .call(d3.axisBottom(xH).ticks(12).tickFormat(d3.format('d')))
    .call(g => g.select('.domain').attr('stroke','rgba(190,235,255,0.32)'))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.70)').style('font-size','10px'));

  hSvg.append('g')
    .call(d3.axisLeft(yH).ticks(5).tickFormat(d => Math.round(d * 100) + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('line').attr('stroke','rgba(190,235,255,0.10)').attr('x2',hW))
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.70)').style('font-size','10px'));

  const coastlineGen = d3.line().x((d, i) => xH(years[i])).y(d => yH(d)).curve(d3.curveBasis);
  const sstNorm = sstVals.map(v => norm(v, sstVals));
  const slhNorm = slhVals.map(v => norm(v, slhVals));
  const prNorm = precVals.map(v => norm(v, precVals));

  hSvg.append('path').datum(sstNorm).attr('fill','none').attr('stroke','#57c8ff').attr('stroke-width',2).attr('d',coastlineGen);
  hSvg.append('path').datum(slhNorm).attr('fill','none').attr('stroke','#56f1d4').attr('stroke-width',1.6).attr('opacity',0.85).attr('d',coastlineGen);
  hSvg.append('path').datum(prNorm).attr('fill','none').attr('stroke','#9ee493').attr('stroke-width',1.6).attr('opacity',0.85).attr('d',coastlineGen);
  hSvg.append('line').attr('x1',0).attr('x2',hW).attr('y1',yH(0.5)).attr('y2',yH(0.5)).attr('stroke','rgba(190,235,255,0.42)').attr('stroke-dasharray','4,3');

  const selLine = hSvg.append('line').attr('y1',0).attr('y2',hH).attr('stroke','#ffffff').attr('stroke-width',1.5).attr('stroke-dasharray','3,2');
  const dots = {
    sst: hSvg.append('circle').attr('r',5).attr('fill','#fff').attr('stroke','#57c8ff').attr('stroke-width',2),
    slh: hSvg.append('circle').attr('r',4).attr('fill','#fff').attr('stroke','#56f1d4').attr('stroke-width',2),
    pr: hSvg.append('circle').attr('r',4).attr('fill','#fff').attr('stroke','#9ee493').attr('stroke-width',2)
  };
  const selLabel = hSvg.append('text').attr('text-anchor','middle').attr('fill','#444').style('font-size','10px').style('font-weight','600');


  const tm = { top: 18, right: 22, bottom: 36, left: 52 };
  const tW = 860 - tm.left - tm.right;
  const tH = 240 - tm.top - tm.bottom;
  const tSvg = d3.select('#tempTrendSvg').append('g').attr('transform', `translate(${tm.left},${tm.top})`);
  const xT = d3.scaleLinear().domain(d3.extent(years)).range([0, tW]);
  const yT = d3.scaleLinear()
    .domain(d3.extent(sstVals))
    .nice()
    .range([tH, 0]);

  tSvg.append('g').attr('transform', `translate(0,${tH})`)
    .call(d3.axisBottom(xT).ticks(8).tickFormat(d3.format('d')))
    .call(g => g.select('.domain').attr('stroke','rgba(190,235,255,0.34)'))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.74)').style('font-size','10px'));

  tSvg.append('g')
    .call(d3.axisLeft(yT).ticks(5).tickFormat(d => d.toFixed(1) + '°'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('line').attr('stroke','rgba(190,235,255,0.10)').attr('x2',tW))
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.74)').style('font-size','10px'));

  const tempLine = d3.line()
    .x(d => xT(d.year))
    .y(d => yT(d.val))
    .curve(d3.curveCatmullRom.alpha(0.4));

  tSvg.append('path')
    .datum(sstData)
    .attr('fill','none')
    .attr('stroke','#56f1d4')
    .attr('stroke-width',3)
    .attr('stroke-linecap','round')
    .attr('stroke-linejoin','round')
    .attr('d',tempLine);

  tSvg.append('line')
    .attr('x1',0).attr('x2',tW)
    .attr('y1',yT(sstMean)).attr('y2',yT(sstMean))
    .attr('stroke','rgba(255,209,102,0.55)')
    .attr('stroke-dasharray','5,5');

  tSvg.append('text')
    .attr('x',tW)
    .attr('y',yT(sstMean) - 8)
    .attr('text-anchor','end')
    .attr('fill','rgba(255,209,102,0.82)')
    .style('font-size','10px')
    .style('font-weight','800')
    .text('average');

  const tempSelLine = tSvg.append('line')
    .attr('y1',0).attr('y2',tH)
    .attr('stroke','#ffffff')
    .attr('stroke-width',1.4)
    .attr('stroke-dasharray','3,3');

  const tempDot = tSvg.append('circle')
    .attr('r',6)
    .attr('fill','#ffffff')
    .attr('stroke','#56f1d4')
    .attr('stroke-width',2.5);

  const tempValue = tSvg.append('text')
    .attr('text-anchor','middle')
    .attr('fill','#f2fbff')
    .style('font-size','11px')
    .style('font-weight','900');


  const landYears = landTempData.map(d => d.year);
  const landVals = landTempData.map(d => d.val);
  const landMean = d3.mean(landVals);

  const lm = { top: 18, right: 22, bottom: 36, left: 52 };
  const lW = 860 - lm.left - lm.right;
  const lH = 240 - lm.top - lm.bottom;
  const lSvg = d3.select('#landTempTrendSvg').append('g').attr('transform', `translate(${lm.left},${lm.top})`);
  const xL = d3.scaleLinear().domain(d3.extent(landYears)).range([0, lW]);
  const yL = d3.scaleLinear().domain(d3.extent(landVals)).nice().range([lH, 0]);

  lSvg.append('g').attr('transform', `translate(0,${lH})`)
    .call(d3.axisBottom(xL).ticks(8).tickFormat(d3.format('d')))
    .call(g => g.select('.domain').attr('stroke','rgba(190,235,255,0.34)'))
    .call(g => g.selectAll('line').remove())
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.74)').style('font-size','10px'));

  lSvg.append('g')
    .call(d3.axisLeft(yL).ticks(5).tickFormat(d => d.toFixed(1) + '°'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('line').attr('stroke','rgba(190,235,255,0.10)').attr('x2',lW))
    .call(g => g.selectAll('text').attr('fill','rgba(212,232,242,0.74)').style('font-size','10px'));

  const landLine = d3.line()
    .x(d => xL(d.year))
    .y(d => yL(d.val))
    .curve(d3.curveCatmullRom.alpha(0.4));

  lSvg.append('path')
    .datum(landTempData)
    .attr('fill','none')
    .attr('stroke','#ffd166')
    .attr('stroke-width',3)
    .attr('stroke-linecap','round')
    .attr('stroke-linejoin','round')
    .attr('d',landLine);

  lSvg.append('line')
    .attr('x1',0).attr('x2',lW)
    .attr('y1',yL(landMean)).attr('y2',yL(landMean))
    .attr('stroke','rgba(86,241,212,0.45)')
    .attr('stroke-dasharray','5,5');

  lSvg.append('text')
    .attr('x',lW)
    .attr('y',yL(landMean) - 8)
    .attr('text-anchor','end')
    .attr('fill','rgba(86,241,212,0.82)')
    .style('font-size','10px')
    .style('font-weight','800')
    .text('average');

  const landSelLine = lSvg.append('line')
    .attr('y1',0).attr('y2',lH)
    .attr('stroke','#ffffff')
    .attr('stroke-width',1.4)
    .attr('stroke-dasharray','3,3');

  const landDot = lSvg.append('circle')
    .attr('r',6)
    .attr('fill','#ffffff')
    .attr('stroke','#ffd166')
    .attr('stroke-width',2.5);

  const landValue = lSvg.append('text')
    .attr('text-anchor','middle')
    .attr('fill','#f2fbff')
    .style('font-size','11px')
    .style('font-weight','900');

  function update(yr) {
    const i = years.indexOf(yr);
    if (i === -1) return;
    const sst = sstVals[i], slh = slhVals[i], prec = precVals[i];
    document.getElementById('yearDisplay').textContent = yr;

    const sstDiff = sst - sstMean;
    document.getElementById('gSst').innerHTML = sst.toFixed(1) + '<span class="gauge-unit">°C</span>';
    const dSst = document.getElementById('dSst');
    dSst.textContent = deltaText(sstDiff, 1, '°C');
    dSst.className = 'gauge-delta ' + deltaClass(sstDiff, 0.15);
    document.getElementById('bSst').style.cssText = `width:${pct(sst, sstVals)}%;background:#1a5276;`;

    const slhDiff = slh - slhMean;
    document.getElementById('gSlh').innerHTML = slh.toFixed(3) + '<span class="gauge-unit">m</span>';
    const dSlh = document.getElementById('dSlh');
    dSlh.textContent = deltaText(slhDiff, 3, 'm');
    dSlh.className = 'gauge-delta ' + deltaClass(slhDiff, 0.005);
    document.getElementById('bSlh').style.cssText = `width:${pct(slh, slhVals)}%;background:#1a8cad;`;

    const prDiff = prec - precMean;
    document.getElementById('gPr').innerHTML = Math.round(prec) + '<span class="gauge-unit">mm/mo</span>';
    const dPr = document.getElementById('dPr');
    dPr.textContent = (prDiff >= 0 ? '▲ +' : '▼ ') + Math.abs(Math.round(prDiff)) + ' mm vs average';
    dPr.className = 'gauge-delta ' + deltaClass(prDiff, 1.5);
    document.getElementById('bPr').style.cssText = `width:${pct(prec, precVals)}%;background:#2e7d32;`;

    const cx = xH(yr);
    selLine.attr('x1', cx).attr('x2', cx);
    dots.sst.attr('cx', cx).attr('cy', yH(sstNorm[i]));
    dots.slh.attr('cx', cx).attr('cy', yH(slhNorm[i]));
    dots.pr.attr('cx', cx).attr('cy', yH(prNorm[i]));
    selLabel.attr('x', cx).attr('y', Math.min(yH(sstNorm[i]), yH(slhNorm[i]), yH(prNorm[i])) - 10).text(yr);

    const tx = xT(yr);
    tempSelLine.attr('x1', tx).attr('x2', tx);
    tempDot.attr('cx', tx).attr('cy', yT(sst));
    tempValue
      .attr('x', tx)
      .attr('y', yT(sst) - 13)
      .text(sst.toFixed(1) + '°C');

    const li = landYears.indexOf(yr);
    if (li !== -1) {
      const lx = xL(yr);
      const landTemp = landVals[li];
      landSelLine.attr('x1', lx).attr('x2', lx);
      landDot.attr('cx', lx).attr('cy', yL(landTemp));
      landValue
        .attr('x', lx)
        .attr('y', yL(landTemp) - 13)
        .text(landTemp.toFixed(1) + '°C');
    }
  }

  document.getElementById('yearSlider').addEventListener('input', e => update(+e.target.value));
  update(1997);

/* ---- Added interactive features: progress, autoplay, scanner, comparison, particles, reveal ---- */
(function() {
  const root = document.documentElement;

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }


  const progressFill = document.getElementById('scroll-progress-fill');
  const progressStops = Array.from(document.querySelectorAll('.progress-stops a'));
  const progressSections = progressStops
    .map(a => ({ link: a, el: document.getElementById(a.dataset.section) || document.querySelector(a.getAttribute('href')) }))
    .filter(d => d.el);

  function updateScrollProgress() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = clamp((window.scrollY / max) * 100, 0, 100);
    if (progressFill) progressFill.style.width = pct + '%';

    let active = progressSections[0];
    const marker = window.scrollY + window.innerHeight * 0.42;
    progressSections.forEach(item => {
      if (item.el.offsetTop <= marker) active = item;
    });
    progressStops.forEach(a => a.classList.toggle('active', active && a === active.link));
  }
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('resize', updateScrollProgress);
  updateScrollProgress();

  const playBtn = document.getElementById('play-years');
  const yearSlider = document.getElementById('dec-sl');
  let playTimer = null;
  function stopTimeline() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    if (playBtn) {
      playBtn.classList.remove('playing');
      playBtn.textContent = '▶ Play';
    }
  }
  function startTimeline() {
    if (!yearSlider || typeof setYear !== 'function') return;
    if (playBtn) {
      playBtn.classList.add('playing');
      playBtn.textContent = 'Ⅱ Pause';
    }
    playTimer = setInterval(() => {
      const max = +yearSlider.max;
      let next = +yearSlider.value + 1;
      if (next > max) next = +yearSlider.min;
      yearSlider.value = String(next);
      setYear(next);
    }, 420);
  }
  if (playBtn) {
    playBtn.addEventListener('click', () => playTimer ? stopTimeline() : startTimeline());
    if (yearSlider) yearSlider.addEventListener('input', stopTimeline);
  }

  window.updateMapScanner = function(name, hot, cold, range, selected) {
    const scanName = document.getElementById('scan-name');
    const scanHot = document.getElementById('scan-hot');
    const scanCold = document.getElementById('scan-cold');
    const scanRange = document.getElementById('scan-range');
    const scanNote = document.getElementById('scan-note');
    if (!scanName) return;
    scanName.textContent = name + ' County';
    scanHot.textContent = hot;
    scanCold.textContent = cold;
    scanRange.textContent = range;
    if (scanNote) scanNote.textContent = SCALES[mode].title + ' in ' + YEARS[di] + ': ' + selected + '. Click the county to pin its trend.';
  };

  window.resetMapScanner = function() {
    const scanName = document.getElementById('scan-name');
    const scanHot = document.getElementById('scan-hot');
    const scanCold = document.getElementById('scan-cold');
    const scanRange = document.getElementById('scan-range');
    const scanNote = document.getElementById('scan-note');
    if (!scanName) return;
    scanName.textContent = 'Move over California';
    scanHot.textContent = '—';
    scanCold.textContent = '—';
    scanRange.textContent = '—';
    if (scanNote) scanNote.textContent = 'Hover a county to turn the map into a small climate scanner.';
  };

  const reveal = document.getElementById('reveal-card');
  if (reveal && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) reveal.classList.add('is-visible');
      });
    }, { threshold: 0.35 });
    io.observe(reveal);
  } else if (reveal) {
    reveal.classList.add('is-visible');
  }

  const canvas = document.getElementById('ocean-particles');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, particles = [];
    function resizeParticles() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.width = Math.floor(window.innerWidth * dpr);
      h = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.max(38, Math.floor(window.innerWidth / 18)));
      particles = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: 0.6 + Math.random() * 1.8,
        vx: 0.18 + Math.random() * 0.45,
        vy: -0.06 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2
      }));
    }
    function drawParticles(t) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy + Math.sin(t * 0.001 + p.phase) * 0.12;
        if (p.x > window.innerWidth + 20) p.x = -20;
        if (p.y < -20) p.y = window.innerHeight + 20;
        if (p.y > window.innerHeight + 20) p.y = -20;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = i % 5 === 0 ? 'rgba(255,209,102,0.32)' : 'rgba(86,241,212,0.22)';
        ctx.fill();
        if (i % 3 === 0) {
          ctx.beginPath();
          ctx.moveTo(p.x - 26, p.y + 8);
          ctx.lineTo(p.x + 30, p.y - 9);
          ctx.strokeStyle = 'rgba(87,200,255,0.10)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
      requestAnimationFrame(drawParticles);
    }
    resizeParticles();
    window.addEventListener('resize', resizeParticles);
    requestAnimationFrame(drawParticles);
  }
})();
