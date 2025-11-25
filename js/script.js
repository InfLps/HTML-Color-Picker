/**
 * Advanced Color Picker Logic
 */

// --- Global Config ---
const CURSOR_RADIUS = 10;
const CURSOR_WIDTH = 1;

// --- State ---
const state = {
    h: 0, s: 1, v: 1,
    r: 255, g: 0, b: 0,
    a: 255,
    format: 'rgba'
};

// Color presets
const colorPresets = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FF4500', '#FF1493', '#9400D3', '#000000', '#FFFFFF', '#808080',
    '#FFA500', '#FFD700', '#ADFF2F', '#32CD32', '#00FA9A', '#40E0D0',
    '#1E90FF', '#000080', '#8A2BE2', '#FF69B4', '#F5F5DC', '#A52A2A'
];

// --- Helper Functions ---
function hsvToRgb(h, s, v) {
    let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b), h, s, v = max, d = max - min;
    s = max == 0 ? 0 : d / max;
    if (max == min) h = 0;
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s, v: v };
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Base Class for Canvas
 */
class ResponsiveCanvas {
    constructor(canvasId, maintainAspectRatio = null) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.maintainAspectRatio = maintainAspectRatio;
        
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.canvas.parentElement);
        
        this.dpr = 1;
        this.w = 0;
        this.h = 0;
    }

    resize() {
        const parent = this.canvas.parentElement;
        const rect = parent.getBoundingClientRect();
        
        this.w = rect.width;
        
        if (this.maintainAspectRatio) {
            this.h = this.w / this.maintainAspectRatio;
            this.canvas.style.height = `${this.h}px`;
        } else {
            this.h = rect.height;
            this.canvas.style.height = '100%';
        }

        this.dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = this.w * this.dpr;
        this.canvas.height = this.h * this.dpr;

        this.ctx.scale(this.dpr, this.dpr);
        this.draw();
    }

    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }
    
    drawCommonCursor(x, y, fillStyle) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, CURSOR_RADIUS, 0, Math.PI*2);
        this.ctx.strokeStyle = "white";
        this.ctx.lineWidth = CURSOR_WIDTH;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(x, y, CURSOR_RADIUS - 1, 0, Math.PI*2);
        this.ctx.fillStyle = fillStyle;
        this.ctx.fill();
    }
}

/**
 * HUE + SV PICKER (Aspect Ratio 1:1)
 */
class HueSVPicker extends ResponsiveCanvas {
    constructor(canvasId) {
        super(canvasId, 1);
        this.isDraggingHue = false;
        this.isDraggingSV = false;
        this.setupEvents();
    }

    draw() {
        if(!this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);

        const wheelThick = this.w * 0.08; 
        const padding = 5;
        const cx = this.w / 2;
        const cy = this.h / 2;
        const outerR = (this.w / 2) - padding;
        const innerR = outerR - wheelThick;

        // Hue Wheel
        const hueGrad = ctx.createConicGradient(-Math.PI / 2, cx, cy);
        for(let i=0; i<=360; i+=10) hueGrad.addColorStop(i/360, `hsl(${i}, 100%, 50%)`);
        
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
        ctx.fillStyle = hueGrad;
        ctx.fill();

        // SV Square
        const sqSize = (innerR * Math.sqrt(2)) - (padding * 3);
        this.sqRect = {
            x: cx - sqSize/2, y: cy - sqSize/2, w: sqSize, h: sqSize
        };

        // Saturation
        const satGrad = ctx.createLinearGradient(this.sqRect.x, 0, this.sqRect.x + this.sqRect.w, 0);
        satGrad.addColorStop(0, "white");
        satGrad.addColorStop(1, `hsl(${state.h}, 100%, 50%)`);
        ctx.fillStyle = satGrad;
        ctx.fillRect(this.sqRect.x, this.sqRect.y, this.sqRect.w, this.sqRect.h);

        // Value
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        const valGrad = ctx.createLinearGradient(0, this.sqRect.y, 0, this.sqRect.y + this.sqRect.h);
        valGrad.addColorStop(0, "white");
        valGrad.addColorStop(1, "black");
        ctx.fillStyle = valGrad;
        ctx.fillRect(this.sqRect.x, this.sqRect.y, this.sqRect.w, this.sqRect.h);
        ctx.restore();

        // Cursors
        // Hue
        const hRad = (state.h - 90) * (Math.PI / 180);
        const selDist = outerR - (wheelThick / 2);
        this.drawCommonCursor(
            cx + selDist * Math.cos(hRad),
            cy + selDist * Math.sin(hRad),
            `hsl(${state.h}, 100%, 50%)`
        );

        // SV
        const svX = this.sqRect.x + (state.s * this.sqRect.w);
        const svY = this.sqRect.y + ((1 - state.v) * this.sqRect.h);
        const rgb = hsvToRgb(state.h/360, state.s, state.v);
        this.drawCommonCursor(svX, svY, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        
        this.geom = { innerR, outerR, cx, cy };
    }

    setupEvents() {
        const handle = (e) => {
            const {x, y} = this.getPointerPos(e);
            const dx = x - this.geom.cx, dy = y - this.geom.cy;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (e.type === 'mousedown' || e.type === 'touchstart') {
                if (dist >= this.geom.innerR && dist <= this.geom.outerR) this.isDraggingHue = true;
                else if (x >= this.sqRect.x && x <= this.sqRect.x + this.sqRect.w &&
                         y >= this.sqRect.y && y <= this.sqRect.y + this.sqRect.h) this.isDraggingSV = true;
            }

            if (this.isDraggingHue) {
                state.h = (Math.atan2(dy, dx) * (180 / Math.PI) + 450) % 360;
                updateFromHueSV();
            } else if (this.isDraggingSV) {
                state.s = Math.max(0, Math.min(1, (x - this.sqRect.x) / this.sqRect.w));
                state.v = Math.max(0, Math.min(1, 1 - ((y - this.sqRect.y) / this.sqRect.h)));
                updateFromHueSV();
            }
        };
        const stop = () => { this.isDraggingHue = false; this.isDraggingSV = false; };
        this.canvas.addEventListener('mousedown', handle);
        this.canvas.addEventListener('mousemove', (e) => { if(this.isDraggingHue || this.isDraggingSV) handle(e); });
        window.addEventListener('mouseup', stop);
        this.canvas.addEventListener('touchstart', (e) => { handle(e); e.preventDefault(); }, {passive: false});
        this.canvas.addEventListener('touchmove', (e) => { if(this.isDraggingHue || this.isDraggingSV) handle(e); e.preventDefault(); }, {passive: false});
        window.addEventListener('touchend', stop);
    }
}

/**
 * VERTICAL ALPHA SLIDER
 */
class AlphaSlider extends ResponsiveCanvas {
    constructor(canvasId) {
        super(canvasId);
        this.isDragging = false;
        this.setupEvents();
    }

    draw() {
        if(!this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0,0, this.w, this.h);

        const pad = 8;
        const barX = pad;
        const barY = pad;
        const barW = this.w - (pad * 2);
        const barH = this.h - (pad * 2);

        // Checkerboard
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#666';
        const chk = 6;
        for(let i=0; i<barW/chk; i++) {
            for(let j=0; j<barH/chk; j++) {
                if((i+j)%2 !== 0) ctx.fillRect(barX + i*chk, barY + j*chk, chk, chk);
            }
        }

        // Gradient
        const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
        grad.addColorStop(0, `rgba(${state.r},${state.g},${state.b}, 1)`);
        grad.addColorStop(1, `rgba(${state.r},${state.g},${state.b}, 0)`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW, barH);

        // Cursor
        const curY = barY + ((255 - state.a) / 255) * barH;
        const curX = this.w / 2;
        
        this.drawCommonCursor(curX, curY, `rgba(${state.r},${state.g},${state.b}, ${state.a/255})`);

        this.geom = { barY, barH };
    }

    setupEvents() {
        const handle = (e) => {
            const {y} = this.getPointerPos(e);
            if (this.isDragging || e.type === 'mousedown' || e.type === 'touchstart') {
                let norm = (y - this.geom.barY) / this.geom.barH;
                let val = 1 - Math.max(0, Math.min(1, norm));
                state.a = Math.round(val * 255);
                refreshAll();
            }
        };
        this.canvas.addEventListener('mousedown', () => this.isDragging = true);
        this.canvas.addEventListener('mousemove', (e) => { if(this.isDragging) handle(e); });
        window.addEventListener('mouseup', () => this.isDragging = false);
        this.canvas.addEventListener('touchstart', (e) => { this.isDragging = true; handle(e); e.preventDefault(); }, {passive:false});
        this.canvas.addEventListener('touchmove', (e) => { if(this.isDragging) handle(e); e.preventDefault(); }, {passive:false});
        window.addEventListener('touchend', () => this.isDragging = false);
    }
}

/**
 * RGB SLIDERS
 */
class RGBSliders extends ResponsiveCanvas {
    constructor(canvasId) {
        super(canvasId); 
        this.activeSlider = null;
        this.setupEvents();
    }

    draw() {
        if(!this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.w, this.h);

        const padX = 15;
        const trackH = 20;
        const availH = this.h;
        const gap = (availH - (trackH * 3)) / 4;
        
        const trackW = this.w - (padX * 2);

        this.sliderGeom = [
            { type: 'r', y: gap },
            { type: 'g', y: gap*2 + trackH },
            { type: 'b', y: gap*3 + trackH*2 }
        ];

        this.sliderGeom.forEach(s => {
            // Track background
            const grad = ctx.createLinearGradient(padX, 0, padX + trackW, 0);
            if(s.type === 'r') {
                grad.addColorStop(0, `rgb(0, ${state.g}, ${state.b})`);
                grad.addColorStop(1, `rgb(255, ${state.g}, ${state.b})`);
            } else if(s.type === 'g') {
                grad.addColorStop(0, `rgb(${state.r}, 0, ${state.b})`);
                grad.addColorStop(1, `rgb(${state.r}, 255, ${state.b})`);
            } else {
                grad.addColorStop(0, `rgb(${state.r}, ${state.g}, 0)`);
                grad.addColorStop(1, `rgb(${state.r}, ${state.g}, 255)`);
            }
            
            // Round caps for track
            ctx.lineCap = "round";
            ctx.lineWidth = trackH;
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(padX, s.y + trackH/2);
            ctx.lineTo(padX + trackW, s.y + trackH/2);
            ctx.stroke();

            // Cursor
            let val = state[s.type];
            let cx = padX + (val / 255) * trackW;
            let cy = s.y + trackH/2;
            
            this.drawCommonCursor(cx, cy, `rgb(${state.r}, ${state.g}, ${state.b})`);
            
            // Interaction zone
            s.hitY = s.y;
            s.hitH = trackH + gap;
        });

        this.common = { padX, trackW };
    }

    setupEvents() {
        const handle = (e) => {
            const {x, y} = this.getPointerPos(e);
            if (e.type === 'mousedown' || e.type === 'touchstart') {
                this.activeSlider = null;
                this.sliderGeom.forEach(s => {
                    if (y >= s.hitY - 10 && y <= s.hitY + s.hitH + 10) this.activeSlider = s.type;
                });
            }
            if (this.activeSlider) {
                let norm = (x - this.common.padX) / this.common.trackW;
                state[this.activeSlider] = Math.round(Math.max(0, Math.min(1, norm)) * 255);
                updateFromRGB();
            }
        };
        const stop = () => { this.activeSlider = null; };
        this.canvas.addEventListener('mousedown', handle);
        this.canvas.addEventListener('mousemove', (e) => { if(this.activeSlider) handle(e); });
        window.addEventListener('mouseup', stop);
        this.canvas.addEventListener('touchstart', (e) => { handle(e); e.preventDefault(); }, {passive:false});
        this.canvas.addEventListener('touchmove', (e) => { if(this.activeSlider) handle(e); e.preventDefault(); }, {passive:false});
        window.addEventListener('touchend', stop);
    }
}

// --- Init & Refresh ---
const huePicker = new HueSVPicker('hueSVCanvas');
const rgbSliders = new RGBSliders('rgbCanvas');
const alphaSlider = new AlphaSlider('alphaCanvas');

function updateFromHueSV() {
    const rgb = hsvToRgb(state.h/360, state.s, state.v);
    state.r = rgb.r; state.g = rgb.g; state.b = rgb.b;
    refreshAll();
}

function updateFromRGB() {
    const hsv = rgbToHsv(state.r, state.g, state.b);
    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
    refreshAll();
}

function refreshAll() {
    huePicker.draw();
    rgbSliders.draw();
    alphaSlider.draw();
    
    // Update preview
    const a = (state.a / 255).toFixed(2);
    const css = `rgba(${state.r}, ${state.g}, ${state.b}, ${a})`;
    document.getElementById('previewInner').style.backgroundColor = css;
    
    // Update value displays
    document.getElementById('rValue').textContent = state.r;
    document.getElementById('gValue').textContent = state.g;
    document.getElementById('bValue').textContent = state.b;
    document.getElementById('aValue').textContent = a;
    
    // Update color text based on format
    updateColorText();
}

function updateColorText() {
    const a = (state.a / 255).toFixed(2);
    let text;
    
    switch(state.format) {
        case 'rgba':
            text = `rgba(${state.r}, ${state.g}, ${state.b}, ${a})`;
            break;
        case 'hex':
            text = rgbToHex(state.r, state.g, state.b);
            break;
        case 'hsla':
            const hsl = rgbToHsl(state.r, state.g, state.b);
            text = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${a})`;
            break;
    }
    
    document.getElementById('colorText').innerText = text;
}

function setupPresets() {
    const presetsGrid = document.getElementById('presetsGrid');
    
    colorPresets.forEach(color => {
        const preset = document.createElement('div');
        preset.className = 'preset-color';
        preset.style.backgroundColor = color;
        preset.addEventListener('click', () => {
            const rgb = hexToRgb(color);
            if (rgb) {
                state.r = rgb.r;
                state.g = rgb.g;
                state.b = rgb.b;
                updateFromRGB();
            }
        });
        presetsGrid.appendChild(preset);
    });
}

function setupFormatButtons() {
    const formatBtns = document.querySelectorAll('.format-btn');
    
    formatBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            formatBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.format = btn.dataset.format;
            updateColorText();
        });
    });
}

function setupActionButtons() {
    // Copy button
    document.getElementById('copyBtn').addEventListener('click', () => {
        const text = document.getElementById('colorText').innerText;
        navigator.clipboard.writeText(text).then(() => {
            const originalText = document.getElementById('copyBtn').textContent;
            document.getElementById('copyBtn').textContent = 'Copied!';
            setTimeout(() => {
                document.getElementById('copyBtn').textContent = originalText;
            }, 1500);
        });
    });
    
    // Random button
    document.getElementById('randomBtn').addEventListener('click', () => {
        state.r = Math.floor(Math.random() * 256);
        state.g = Math.floor(Math.random() * 256);
        state.b = Math.floor(Math.random() * 256);
        updateFromRGB();
    });
}

// Initialize everything
setupPresets();
setupFormatButtons();
setupActionButtons();
refreshAll();
