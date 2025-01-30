class WarDashboard {
    constructor() {
        this.map = null;
        this.geoData = null;
        this.sheetData = [];
        this.currentLayer = null;
        this.filters = {
            startDate: null,
            endDate: null,
            state: 'အားလုံး',
            township: 'အားလုံး',
            group: 'အားလုံး'
        };

        this.init();
    }

    async init() {
        await this.loadData();
        this.initMap();
        this.initFilters();
        this.initDatePicker();
        this.updateDashboard();
    }

    async loadData() {
        try {
            const [sheetResponse, geoResponse] = await Promise.all([
                this.fetchGoogleSheet(),
                fetch('data/myanmar_townships.geojson').then(r => r.json())
            ]);
            
            this.sheetData = sheetResponse;
            this.geoData = geoResponse;
            this.mergedData = this.mergeData();
        } catch (error) {
            console.error('Data loading error:', error);
        }
    }

    async fetchGoogleSheet() {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.GOOGLE_SHEETS.SHEET_ID}/values/${CONFIG.GOOGLE_SHEETS.RANGE}?key=${CONFIG.GOOGLE_SHEETS.API_KEY}`;
        const response = await axios.get(url);
        return this.processSheetData(response.data.values);
    }

    processSheetData(rows) {
        const headers = rows[0];
        return rows.slice(1).map(row => {
            const item = {};
            headers.forEach((header, index) => {
                item[header] = row[index];
            });
            return item;
        });
    }

    mergeData() {
        return this.geoData.features.map(feature => {
            const township = feature.properties.TS_MMR;
            const sheetEntry = this.sheetData.find(d => d.TS_MMR_DASH === township);
            
            return {
                ...feature,
                properties: {
                    ...feature.properties,
                    ...sheetEntry,
                    totalTime: sheetEntry ? parseInt(sheetEntry.Time) || 0 : 0
                }
            };
        });
    }

    initMap() {
        this.map = L.map('map', {
            center: CONFIG.MAP.CENTER,
            zoom: CONFIG.MAP.ZOOM,
            fullscreenControl: true
        });

        L.tileLayer(CONFIG.MAP.TILES, {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.addLegend();
    }

    updateChoropleth() {
        if (this.currentLayer) this.map.removeLayer(this.currentLayer);

        const filteredData = this.applyFilters();
        const maxTime = Math.max(...filteredData.map(d => d.properties.totalTime));

        this.currentLayer = L.geoJson(filteredData, {
            style: feature => this.getStyle(feature, maxTime),
            onEachFeature: (feature, layer) => this.addPopup(feature, layer)
        }).addTo(this.map);

        this.updateSummaryCards(filteredData);
        this.updateHeadlines(filteredData);
    }

    getStyle(feature, maxTime) {
        const value = feature.properties.totalTime;
        const intensity = value / maxTime;
        
        return {
            fillColor: `hsl(0, 100%, ${100 - (intensity * 50)}%)`,
            weight: 1,
            opacity: 1,
            color: 'white',
            fillOpacity: 0.7
        };
    }

    addPopup(feature, layer) {
        const props = feature.properties;
        const content = `
            <div class="burmese-text">
                <h5>${props.Headline || 'အချက်အလက်မရှိပါ'}</h5>
                <p>${props.ST_MMR}၊ ${props.TS_MMR_DASH}</p>
                <p>ဖြစ်စဉ်အကြိမ်ရေ: ${props.totalTime}</p>
                ${props.Link ? `<a href="${props.Link}" target="_blank">အပြည့်အစုံဖတ်ရန်</a>` : ''}
            </div>
        `;
        layer.bindPopup(content);
    }

    addLegend() {
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <h4>ဖြစ်စဉ်အကြိမ်ရေ</h4>
                <div class="legend-item"><span style="background:hsl(0, 100%, 50%)"></span>များ</div>
                <div class="legend-item"><span style="background:hsl(0, 100%, 75%)"></span>ပျှမ်းမျှ</div>
                <div class="legend-item"><span style="background:hsl(0, 100%, 90%)"></span>နည်း</div>
            `;
            return div;
        };
        legend.addTo(this.map);
    }

    applyFilters() {
        return this.mergedData.filter(feature => {
            const props = feature.properties;
            const date = new Date(props.Date);
            
            // Date filter
            const dateMatch = (
                (!this.filters.startDate || date >= this.filters.startDate) &&
                (!this.filters.endDate || date <= this.filters.endDate)
            );

            // State filter
            const stateMatch = (
                this.filters.state === 'အားလုံး' ||
                props.ST_MMR === this.filters.state
            );

            // Township filter
            const townshipMatch = (
                this.filters.township === 'အားလုံး' ||
                props.TS_MMR_DASH === this.filters.township
            );

            // Group filter
            const groupMatch = (
                this.filters.group === 'အားလုံး' ||
                props.Groups === this.filters.group
            );

            return dateMatch && stateMatch && townshipMatch && groupMatch;
        });
    }

    updateSummaryCards(data) {
        const totals = data.reduce((acc, feature) => ({
            sacrificeSac: acc.sacrificeSac + parseInt(feature.properties.စကစကျဆုံး || 0),
            revolutionMartyrs: acc.revolutionMartyrs + parseInt(feature.properties.တော်လှန်ရေးကျဆုံး || 0),
            capturedBases: acc.capturedBases + parseInt(feature.properties['စခန်းသိမ်း(တော်လှန်ရေး)'] || 0) +
                           parseInt(feature.properties['စခန်းသိမ်း(စကစ)'] || 0),
            prisonersWar: acc.prisonersWar + parseInt(feature.properties.စစ်သုံပန်း || 0)
        }), { sacrificeSac: 0, revolutionMartyrs: 0, capturedBases: 0, prisonersWar: 0 });

        document.getElementById('sacrifice-sac').textContent = totals.sacrificeSac;
        document.getElementById('revolution-martyrs').textContent = totals.revolutionMartyrs;
        document.getElementById('captured-bases').textContent = totals.capturedBases;
        document.getElementById('prisoners-war').textContent = totals.prisonersWar;
    }

    updateHeadlines(data) {
        const headlines = data.map(feature => `
            <div class="mb-2 p-2 border-bottom">
                <div class="fw-bold">${feature.properties.Type1 || ''}</div>
                <div class="text-muted">${feature.properties.Headline || ''}</div>
            </div>
        `).join('');
        
        document.getElementById('headlines').innerHTML = headlines;
    }

    initDatePicker() {
        flatpickr('#date-range', {
            mode: 'range',
            dateFormat: 'Y-m-d',
            onChange: dates => {
                [this.filters.startDate, this.filters.endDate] = dates;
                this.updateDashboard();
            }
        });
    }

    initFilters() {
        this.initSelectFilter('state-filter', 'ST_MMR');
        this.initSelectFilter('township-filter', 'TS_MMR_DASH');
        this.initGroupFilter();
    }

    initGroupFilter() {
        const select = document.getElementById('group-filter');
        select.addEventListener('change', e => {
            this.filters.group = e.target.value;
            this.updateDashboard();
        });
        this.updateGroupFilter();
    }

    initSelectFilter(elementId, property) {
        const select = document.getElementById(elementId);
        const values = [...new Set(this.sheetData.map(d => d[property]))].filter(Boolean);
        
        // Add "All" option
        const allOption = document.createElement('option');
        allOption.value = 'အားလုံး';
        allOption.textContent = 'အားလုံး';
        select.appendChild(allOption);

        // Add other options
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

        // Event listeners
        if (elementId === 'state-filter') {
            select.addEventListener('change', e => {
                this.filters.state = e.target.value;
                this.updateTownshipFilter();
                this.updateGroupFilter();
                this.updateDashboard();
            });
        } else if (elementId === 'township-filter') {
            select.addEventListener('change', e => {
                this.filters.township = e.target.value;
                this.updateGroupFilter();
                this.updateDashboard();
            });
        }
    }

    updateTownshipFilter() {
        const townshipSelect = document.getElementById('township-filter');
        const townships = this.sheetData
            .filter(d => this.filters.state === 'အားလုံး' || d.ST_MMR === this.filters.state)
            .map(d => d.TS_MMR_DASH)
            .filter(Boolean);

        townshipSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'အားလုံး';
        allOption.textContent = 'အားလုံး';
        townshipSelect.appendChild(allOption);

        [...new Set(townships)].forEach(township => {
            const option = document.createElement('option');
            option.value = township;
            option.textContent = township;
            townshipSelect.appendChild(option);
        });

        this.filters.township = 'အားလုံး';
    }

    updateGroupFilter() {
        const groupSelect = document.getElementById('group-filter');
        const filteredData = this.sheetData.filter(d => {
            const stateMatch = this.filters.state === 'အားလုံး' || d.ST_MMR === this.filters.state;
            const townshipMatch = this.filters.township === 'အားလုံး' || d.TS_MMR_DASH === this.filters.township;
            return stateMatch && townshipMatch;
        });
        
        const groups = filteredData.map(d => d.Groups).filter(Boolean);

        groupSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'အားလုံး';
        allOption.textContent = 'အားလုံး';
        groupSelect.appendChild(allOption);

        [...new Set(groups)].forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = group;
            groupSelect.appendChild(option);
        });

        this.filters.group = 'အားလုံး';
    }

    updateDashboard() {
        this.updateChoropleth();
    }
}

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => new WarDashboard());