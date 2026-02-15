class Tide {
    constructor(date) {
        this.date = new Date(date);
        this.year = this.date.getFullYear();
        this.hourDST = 0; // Set to 1 if you wish to manually offset for DST

        this.arcots = new Arcots(this.year);

        this.tideHoursChart = [];
        this.tideHeightChart = [];
        this.highLowData = []; // Combined {time, height, hhmm}
        
        this.hoursYear = this.calculateHoursIntoYear();
        this.generateChartData();
        this.calculateHighLow();
        
        this.currentTime = this.date.getHours() + this.date.getMinutes() / 60;
        this.currentHeight = this.calculateTideAt(this.hoursYear + this.currentTime);
    }

    /**
     * Calculates hours elapsed from Jan 1st to the current day
     */
    calculateHoursIntoYear(targetDate = new Date()) {
    const startOfYear = Date.UTC(this.year, 0, 1, 0, 0, 0);
    const currentTime = targetDate.getTime();
    const diffMs = currentTime - startOfYear;
    return diffMs / 3600000;
}

    /**
     * Calculates the tide height at a specific time using harmonic analysis.
     * 
     * Combines all 7 primary tidal constituents (M2, S2, N2, K2, K1, O1, P1) to predict
     * the water level. Each constituent contributes based on its amplitude, angular speed,
     * and phase, adjusted for nodal factors and DST offset.
     * 
     * @param {number} hoursSinceYearStart - Total hours elapsed since Jan 1st, 00:00:00 of the current year
     * @returns {number} Predicted tide height in centimeters relative to Mean Sea Level
     */
    calculateTideAt(hoursSinceYearStart) {
        let height = 0;
        const timeAdjusted = hoursSinceYearStart - this.hourDST;
        
        // Loop through the 7 primary constituents
        for (let k = 0; k < 7; k++) {
            height += this.arcots.FH[k] * Math.cos(Arcots.S[k] * timeAdjusted + this.arcots.VUG[k]);
        }
        return height;
    }

    /**
     * Generates a data point for every minute of the day (1440 minutes total).
     * This high resolution ensures a smooth visual curve in the chart and 
     * allows for precise identification of High and Low tide times.
     */
    generateChartData() {
        // Loop from 0 to 1440 (24 hours * 60 minutes)
        for (let i = 0; i <= 1440; i++) {
            
            // Convert the current minute index into a decimal hour (e.g., minute 90 becomes 1.5)
            const hourOffset = i / 60;
            
            // Store the X-axis value (time in decimal hours)
            this.tideHoursChart.push(hourOffset);
            
            // Calculate and store the Y-axis value (tide height)
            // 'hoursYear' provides the base date, 'hourOffset' adds the specific time of day
            const currentTideHeight = this.calculateTideAt(this.hoursYear + hourOffset);
            this.tideHeightChart.push(currentTideHeight);
        }
    }

    /**
     * Finds local peaks (Highs) and valleys (Lows)
     */
    calculateHighLow() {
        for (let i = 1; i < this.tideHeightChart.length - 1; i++) {
            const prev = this.tideHeightChart[i - 1];
            const curr = this.tideHeightChart[i];
            const next = this.tideHeightChart[i + 1];

            // If it's a peak or a valley
            if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
                const hour = this.tideHoursChart[i];
                this.highLowData.push({
                    time: hour,
                    height: curr,
                    label: `${this.formatHHMM(hour)} ${curr.toFixed(1)}`
                });
            }
        }
    }

    formatHHMM(decimalHours) {
    const date = new Date(0); 
    date.setMinutes(Math.round(decimalHours * 60));
    
    // Returns "HH:mm" in 24-hour format
    return date.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}
}



/**
 * UI Controller for the Tide Chart
 */
const TideUI = {
    currentDate: new Date(),

    updateChart() {
        const tide = new Tide(this.currentDate);
        const dayNames = ['nedelja', 'ponedeljek', 'torek', 'sreda', 'četrtek', 'petek', 'sobota'];
        
        // Update Text Display
        const header = `${dayNames[this.currentDate.getDay()]}, ${this.currentDate.getDate()}.${this.currentDate.getMonth() + 1}.${this.currentDate.getFullYear()}`;
        document.getElementById("currtxt").innerText = header;
        document.getElementById("choosedate").value = this.currentDate.toISOString().slice(0, 10);

        // Generate Chart with data
        c3.generate({
            bindto: '#chart',
            data: {
                xs: { 
                    tide: 'x_tide', 
                    peaks: 'x_peaks', 
                    now: 'x_now' 
                },
                columns: [
                    ['x_tide', ...tide.tideHoursChart],
                    ['tide', ...tide.tideHeightChart.map(h => h.toFixed(2))],
                    ['x_peaks', ...tide.highLowData.map(p => p.time)],
                    ['peaks', ...tide.highLowData.map(p => p.height)],
                    ['x_now', tide.currentTime],
                    ['now', tide.currentHeight]
                ],
                names: {
                tide: 'Plimovanje',
                peaks: 'Ekstremi',
                now: 'Sedaj'
                },
                types: { 
                    tide: 'area-spline', // Modern smooth filled curve
                    peaks: 'scatter', 
                    now: 'scatter' 
                },
                // COLOR CONFIGURATION
                colors: {
                    tide: '#2196f3',  // Primary Blue
                    peaks: '#ff9800', // ORANGE for High/Low peaks
                    now: '#4caf50'    // GREEN for Current Time
                }
            },
            point: {
                // Adjust radius based on the data ID
                r: function(d) {
                    if (d.id === 'now') return 8;   // Larger dot for current time
                    if (d.id === 'peaks') return 5; // Medium dots for peaks
                    return 0;                       // Hide dots on the main line
                }
            },
            axis: {
                x: { 
                    tick: { values: [0, 3, 6, 9, 12, 15, 18, 21, 24] }, 
                    max: 24, 
                    min: 0,
                    label: 'Ura'
                },
                y: { 
                    max: 70, 
                    min: -70,
                    label: 'Višina (cm)'
                }
            },
            grid: {
                x: { lines: [{ value: 12, text: 'Poldan' }] },
                y: { lines: [{ value: 0 }] }
            },
            tooltip: {
                format: {
                    title: (x) => 'Ura: ' + tide.formatHHMM(x),
                    value: (v, ratio, id) => {
                        let label = v.toFixed(1) + ' cm';
                        if (id === 'peaks') label += ' (Vrh/Dno)';
                        if (id === 'now') label += ' (Trenutno)';
                        return label;
                    }
                }
            }
        });
    },

    changeDate(days) {
        this.currentDate.setDate(this.currentDate.getDate() + days);
        this.updateChart();
    },

    jumpToDate(dateStr) {
        if (!dateStr) return;
        this.currentDate = new Date(dateStr);
        this.updateChart();
    }
};


const getInitialTidalChart = () => TideUI.updateChart();
const getNextTidalChart = () => TideUI.changeDate(1);
const getPrevTidalChart = () => TideUI.changeDate(-1);
const getChoosenTidalChart = () => TideUI.jumpToDate(document.getElementById("choosedate").value);