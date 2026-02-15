/**
 * Arcots - Astronomical and Tidal Constituent Calculator
 * 
 * This class implements harmonic tidal prediction using the standard method of
 * tidal constituent analysis. It calculates nodal factors and equilibrium arguments
 * for the 7 primary tidal constituents to predict tide heights at any given time.
 * 
 * The implementation is based on classical tidal theory which decomposes the complex
 * tidal signal into harmonic components, each representing the gravitational influence
 * of celestial bodies (primarily the Sun and Moon) at different frequencies.
 * 
 * Key Concepts:
 * - Tidal Constituents: Harmonic components with specific frequencies (M2, S2, N2, K2, K1, O1, P1)
 * - Nodal Factors (f): Amplitude modulation due to the 18.6-year lunar nodal cycle
 * - Equilibrium Arguments (V0+u): Phase angles based on astronomical positions
 * - Harmonic Analysis: Tide = Σ [f × H × cos(S × t + (V0+u) - G)]
 * 
 * Learn More:
 * - NOAA Tidal Analysis: https://tidesandcurrents.noaa.gov/publications/glossary2.pdf
 * - Harmonic Constants: https://www.psmsl.org/train_and_info/training/tidal_analysis/
 * - Tidal Prediction Theory: https://www.ukho.gov.uk/tides/tidal-prediction
 * - Astronomical Algorithms (Meeus): Standard reference for celestial calculations
 * - IHO Tidal Constituent Database: https://iho.int/en/tidal-constituent-data
 * 
 * @class Arcots
 */
class Arcots {
    // Standard Tidal Constituent Names
    static get MA() {
        return ["M2", "S2", "N2", "K2", "K1", "O1", "P1"];
    }

    // Mean Amplitudes (H) in cm
    static get H() {
        return [25.1, 15.8, 4.6, 4.4, 18.2, 5.0, 5.9];
    }

    // Phase Lags (G) in Radians
    static get G() {
        return [4.842, 4.955, 4.815, 4.752, 1.215, 1.079, 1.133];
    }

    // Angular Speeds (S) in Radians per Hour
    static get S() {
        return [
            0.50586805, 0.52359878, 0.49636692, 0.52503234, 
            0.26251617, 0.24335188, 0.26108261
        ];
    }

    static RAD = Math.PI / 180;
    static TAU = 2 * Math.PI;

    constructor(year) {
        this.year = year;
        
        // Internal state arrays
        this.F    = new Float64Array(7); // Nodal factors
        this.V0U  = new Float64Array(7); // Equilibrium arguments
        this.S    = new Float64Array(Arcots.S);
        this.H    = new Float64Array(Arcots.H);
        this.G    = new Float64Array(Arcots.G);
        
        // Pre-calculated components for prediction
        this.compAmplitude = new Float64Array(7); // f * H
        this.compPhase     = new Float64Array(7); // (V0 + u) - G

        const yh = year + 0.5; // Mid-year for nodal factor calculation

        this.calculateNodalFactors(yh);
        this.calculateEquilibriumArguments(year, yh);

        // Pre-calculate constants to minimize work in the prediction loop
        for (let i = 0; i < 7; i++) {
            this.compAmplitude[i] = this.F[i] * this.H[i];
            this.compPhase[i] = this.V0U[i] - this.G[i];
        }
    }

    /**
     * Normalizes an angle to [0, 2π]
     */
    normalize(rad) {
        return ((rad % Arcots.TAU) + Arcots.TAU) % Arcots.TAU;
    }

    /**
     * Calculates the Mean Longitude of the Moon's Ascending Node (N)
     */
    nlong(y) {
        const y0 = y - 1900.0;
        const t = (365.25 * y0 + 0.5) / 36525.0;
        const t2 = t * t;
        const t3 = t2 * t;
        
        let dn = 259.182533 - 1934.142397 * t + 0.002106 * t2 + 0.00000222 * t3;
        return this.normalize(dn * Arcots.RAD);
    }

    /**
     * Prepares orbital coefficients (formerly timcof)
     */
    getOrbitalCoefficients(y) {
        const y0 = y - 1900.0;
        const eccen = 0.01675104 - 4.18e-7 * y0 - 1.26e-11 * y0 * y0;
        const obliq = (23.452294 - 1.30111e-4 * y0) * Arcots.RAD;
        const lunarInc = 5.14537628 * Arcots.RAD;

        const sinI = Math.sin(lunarInc);
        const sinO = Math.sin(obliq);
        
        return {
            cosI: Math.cos(lunarInc),
            cosO: Math.cos(obliq),
            sinI,
            sinO,
            obliq,
            lunarInc,
            eccen,
            termC14: 1.0 - 1.5 * (sinI ** 2)
        };
    }

    /**
     * Calculates nodal factors (f) for tidal constituents.
     * 
     * Nodal factors account for the 18.6-year cycle of the Moon's orbital plane
     * precession around the Earth. This cycle causes the amplitude of tidal constituents
     * to vary slowly over time. The factors modify the mean amplitude (H) to reflect
     * the actual amplitude for the given year.
     * 
     * The calculation uses the longitude of the Moon's ascending node and the angle
     * between the lunar orbital plane and the Earth's equatorial plane to determine
     * how much each constituent's amplitude should be adjusted.
     * 
     * @param {number} y - Mid-year value for nodal factor calculation
     */
    calculateNodalFactors(y) {
        const coeffs = this.getOrbitalCoefficients(y);
        const dn = this.nlong(y); // Longitude of Moon's ascending node
        
        // Calculate the angle I between the lunar orbital plane and Earth's equatorial plane
        // using spherical trigonometry
        const I = Math.acos(coeffs.cosI * coeffs.cosO - coeffs.sinI * coeffs.sinO * Math.cos(dn));
        const xi = Math.atan((Math.sin(2 * I) * Math.sin(dn / 2)) / (0.5 + Math.sin(2 * I) * Math.cos(dn / 2))); // Approximation (unused)
        
        // M2 Factor - Principal lunar semidiurnal constituent
        // Strongly affected by the lunar orbital inclination
        const cosI2 = Math.cos(I / 2);
        this.F[0] = (cosI2 ** 4) / 0.9154; // Normalized by mean value
        
        // S2 Factor - Principal solar semidiurnal constituent
        // Not affected by lunar node, always 1.0
        this.F[1] = 1.0;
        
        // N2 Factor - Larger lunar elliptic semidiurnal constituent
        // Has the same nodal factor as M2
        this.F[2] = this.F[0];
        
        // Remaining factors use simplified nodal cycle adjustments based on
        // the longitude of the ascending node (dn)
        this.F[3] = Math.sqrt(1.0 + 0.2852 * Math.cos(dn) + 0.0204 * Math.cos(2 * dn)); // K2 - Lunisolar semidiurnal
        this.F[4] = Math.sqrt(1.0 + 0.1813 * Math.cos(dn) - 0.0082 * Math.cos(2 * dn)); // K1 - Lunisolar diurnal
        this.F[5] = 1.0089 + 0.1871 * Math.cos(dn) - 0.0147 * Math.cos(2 * dn); // O1 - Lunar diurnal
        this.F[6] = 1.0; // P1 - Solar diurnal (not affected by lunar node)
    }

    /**
     * Calculates equilibrium arguments (V0 + u) for tidal constituents.
     * 
     * The equilibrium argument represents the theoretical phase of each tidal constituent
     * at the beginning of the year, accounting for the astronomical positions of the Sun,
     * Moon, and lunar perigee. These values are combined with the angular speed to predict
     * the phase of each constituent at any given time.
     * 
     * @param {number} y - The year for which to calculate arguments
     * @param {number} yh - Mid-year value (currently unused, kept for potential future use)
     */
    calculateEquilibriumArguments(y, yh) {
        const y0 = y - 1900.0;
        const t = (365.25 * y0 + 0.5) / 36525.0; // Time in Julian centuries from 1900
        
        // Calculate mean longitudes of celestial bodies at the start of the year
        const h = this.normalize((279.696678 + 36000.768925 * t) * Arcots.RAD); // Sun's mean longitude
        const s = this.normalize((270.437422 + 481267.892 * t) * Arcots.RAD); // Moon's mean longitude
        const p = this.normalize((334.328019 + 4069.032206 * t) * Arcots.RAD); // Lunar perigee

        // Calculate equilibrium arguments (V0 + u) for each tidal constituent
        // These formulas combine the celestial body positions to determine the phase
        // of each tidal component at the reference time (Jan 1, 00:00)
        this.V0U[0] = this.normalize(2 * h - 2 * s); // M2 - Principal lunar semidiurnal
        this.V0U[1] = 0.0; // S2 - Principal solar semidiurnal (reference constituent)
        this.V0U[2] = this.normalize(2 * h - 3 * s + p); // N2 - Larger lunar elliptic semidiurnal
        this.V0U[3] = this.normalize(2 * h); // K2 - Lunisolar semidiurnal
        this.V0U[4] = this.normalize(h + Math.PI / 2); // K1 - Lunisolar diurnal
        this.V0U[5] = this.normalize(h - 2 * s - Math.PI / 2); // O1 - Lunar diurnal
        this.V0U[6] = this.normalize(Math.PI / 2 - h); // P1 - Solar diurnal
    }

    /**
     * Predicts the tide height at a specific time.
     * @param {number} hoursSinceJan1 - Hours since Jan 1st, 00:00:00 of the instance year.
     * @returns {number} Tide height in centimeters relative to Mean Sea Level.
     */
    predict(hoursSinceJan1) {
        let height = 0;
        for (let i = 0; i < 7; i++) {
            // Formula: H = f * Amp * cos(Speed * t + (V0 + u) - G)
            height += this.compAmplitude[i] * Math.cos(this.S[i] * hoursSinceJan1 + this.compPhase[i]);
        }
        return height;
    }
}

