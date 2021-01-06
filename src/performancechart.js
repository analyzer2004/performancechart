// https://github.com/analyzer2004/performancechart
// Copyright 2021 Eric Lo
class PerformanceChart {
    constructor(container) {
        this._container = container;

        // Groups
        this._cg = null;
        this._g = null;
        this._og = null;
        this._ig = null;

        // Visual elements and selections        
        this._dots = null;
        this._highlighter = null;
        this._rankAxis = null;
        this._zeroLine = null;
        this._uncLabel = null;
        this._textBox = null;
        this._charBox = null;
        this._infoBox = null;
        this._legendBox = null;

        // Extents        
        this._pMin = 0;
        this._pMax = 0;
        this._nMin = 0;
        this._nMax = 0;
        this._rMin = 0;
        this._rMax = 0;

        // Base variables and constants        
        this._width = 0;
        this._height = 0;
        this._shift = null;
        this._maxY = 0;
        this._leftMargin = 0;
        this._innerMargin = 0;
        this._legendHeight = 0;
        this._dotRadius = 0;
        this._dotDiameter = 0;
        this._maxUnchangedCount = 0;
        this._level = 0;        
        this._defaultLevel = 0;

        // Shortcuts
        this._isNumber = false;
        this._isGrowth = true;
        this._isRate = false;
        this._isCircle = true;

        // Scales        
        this._rk = null;
        this._x = null;
        this._y = null;
        this._yu = null;
        this._cp = null;
        this._cn = null;

        // Data and options        
        this._options = {
            number: "growth",
            isolateUnchanged: true,
            posPalette: d3.interpolateYlGnBu,
            negPalette: d3.interpolateYlOrRd,
            shape: "circle",
            clickAction: "highlight",
            showSlider: true,
            fontFamily: "sans-serif",
            fontSize: "10px",
            debug: false
        };

        this._tick = {
            name: "",
            isDate: false,
            format: "",
            interval: "auto",
            extractor: null,            
            color: "black"
        };

        this._tooltip = {
            color: "black",
            boxColor: "white",
            boxOpacity: 0.8
        };

        this._color = {
            legend: "black",
            hover: "#999",
            highlighter: "#eee",
            unchanged: "#aaa"
        };            

        this._data = null;
        this._chartData = null;
        this._keys = null;
        this._focusedKey = null;
        this._focusedRange = null;
        this._uniqueId = new String(Date.now() * Math.random()).replace(".", "");

        // events
        this._onhover = null;
        this._onclick = null;
        this._oncancel = null;
    }

    size(_) {
        return arguments.length ? (this._width = _[0], this._height = _[1], this) : [this._width, this._height];
    }

    options(_) {
        return arguments.length ? (this._options = Object.assign(this._options, _), this) : this._options;
    }

    tick(_) {
        return arguments.length ? (this._tick = Object.assign(this._tick, _), this) : this._tick;
    }

    color(_) {
        return arguments.length ? (this._color = Object.assign(this._color, _), this) : this._color;
    }

    tooltip(_) {
        return arguments.length ? (this._tooltip = Object.assign(this._tooltip, _), this) : this._tooltip;
    }

    data(_) {
        return arguments.length ? (this._data = _, this) : this._data;
    }

    onhover(_) {
        return arguments.length ? (this._onhover = _, this) : this._onhover;
    }

    onclick(_) {
        return arguments.length ? (this._onclick = _, this) : this._onclick;
    }

    oncancel(_) {
        return arguments.length ? (this._oncancel = _, this) : this._oncancel;
    }

    render() {
        this._init();
        this._process();
        this._calcShift();
        this._calcLeftMargin();
        this._calcConstants();
        this._initScales();
        this._render();
        return this;
    }

    _init() {
        const options = this._options;

        this._textBox = this._container
            .append("text")            
            .attr("font-family", this._options.fontFamily)
            .attr("font-size", this._options.fontSize)
            .style("visibility", "hidden");

        this._getCharBox();
        this._legendHeight = this._charBox.height * 3;
        this._innerMargin = this._charBox.height * 2;

        this._isNumber = options.number === "value";
        this._isGrowth = options.number === "growth";
        this._isRate = !this._isNumber && !this._isGrowth;
        this._isCircle = options.shape === "circle";
    }

    _process(update) {
        this._processKeys();
        const
            start = this._isNumber ? 0 : 1,
            cd = Array(this._data.length - start);

        // Set level to average if number is value
        if (!update && this._isNumber) {            
            const total = this._data
                .flatMap(d => this._keys.map(k => +d[k]))
                .reduce((a, b) => a + b);
            this._defaultLevel = this._level = total / (this._data.length * this._keys.length);
        }

        for (let i = start; i < this._data.length; i++) {            
            let unc = 0;
            const tick = this._data[i][this._tick.name];

            // Extract values by key, calculate growth and rate
            const values = this._keys.map(key => {
                const
                    number = +this._data[i][key],
                    prevValue = i === 0 ? 0 : +this._data[i - 1][key],
                    growth = number - prevValue;

                let rate = 0;
                if (growth === 0) {
                    unc++;
                    if (prevValue === 0) rate = 0; // avoid NaN and it is unchanged
                    else rate = growth / prevValue;
                }
                else rate = growth / prevValue;

                return { index: i, tick, key, number, growth, rate };
            });

            if (unc > this._maxUnchangedCount) this._maxUnchangedCount = unc;
            this._rankValues(values);

            cd[i - start] = { tick, values };
        }
        this._chartData = cd;
    }

    _processKeys() {
        const keys = Object.keys(this._data[0]);

        if (this._tick.name === "") {
            this._tick.name = keys[0];
            this._keys = keys.slice(1);
        }
        else {
            const index = keys.indexOf(this._tick.name);
            if (index > -1) {
                keys.splice(index, 1);
                this._keys = keys;
            }
            else throw "Invalid tick field.";
        }
    }

    _rankValues(values) {
        const
            level = this._level,
            isounc = this._options.isolateUnchanged;

        let pos = 0;
        values.sort((a, b) => this._getValue(b) - this._getValue(a));
        // Rank positive section
        values
            .filter(d => {
                const
                    v = this._getValue(d),
                    g = this._isNumber ? d.growth : v;
                    
                if (isounc ? g !== 0 && v >= level : v >= level) {
                    if (v !== Number.POSITIVE_INFINITY && v > this._pMax) this._pMax = v;
                    else if (v < this._pMin) this._pMin = v;
                    return true;
                }
                else return false;
            })
            .forEach((d, i) => {
                d.rank = i + 1;
                d.pos = pos++;
                if (d.rank > this._rMax) this._rMax = d.rank;
                else if (d.rank < this._rMin) this._rMin = d.rank;
            });

        // Rank negative section
        values
            .filter(d => {
                const
                    v = this._getValue(d),
                    g = this._isNumber ? d.growth : v;

                if (isounc ? g !== 0 && v < level : v < level) {
                    if (v > this._nMax) this._nMax = v;
                    else if (v < this._nMin) this._nMin = v;
                    return true;
                }
                else return false;
            })
            .forEach((d, i) => {
                d.rank = -(i + 1);
                d.pos = pos++;
                if (d.rank > this._rMax) this._rMax = d.rank;
                else if (d.rank < this._rMin) this._rMin = d.rank;
            });
    }

    _calcShift() {
        var a = 0, b = this._keys.length;
        var da = null, db = null;

        this._chartData.forEach(d => {
            let c = d.values.filter(v => this._getValue(v) < this._level).length;            
            //if (this._options.isolateUnchanged) 
                //c -= d.values.filter(v => v.growth === 0).length;

            if (c > a) {
                a = c;
                da = d;
            }

            if (c < b) {
                b = c;
                db = d;
            }
        });

        this._shift = {
            min: { offset: b, data: db },
            max: { offset: a, data: da }
        };
    }

    _calcLeftMargin() {
        const max = this._calcTextLength("-999");
        const margin = this._options.showSlider ? 40 + this._charBox.height : 0; // slider + value text height
        this._leftMargin = margin + max + 6; // max rank tick width + tick line
    }

    _calcConstants() {
        this._calcDotRadius();
        this._calcMaxY();
    }

    _calcDotRadius() {        
        const availHeight = this._height - this._innerMargin - this._legendHeight;

        let n = this._keys.length * 2;
        if (this._maxUnchangedCount > 0) n += this._maxUnchangedCount + 2;

        const
            r1 = availHeight / n / 2,
            r2 = (this._width - this._leftMargin) / this._chartData.length / 2;

        if (r1 < r2)
            this._dotRadius = r1;
        else {
            // radius is based on width and data.length. adjust to fit the available height
            let total = n * r2;
            if (r2 > availHeight)
                this._dotRadius = r2 - (total - availHeight) / 2;
            else
                this._dotRadius = r2;
        }
        this._dotDiameter = this._dotRadius * 2;
    }

    _calcMaxY() {
        var dots = this._shift.max.offset + this._keys.length;
        if (this._options.isolateUnchanged && this._maxUnchangedCount > 0) dots += this._maxUnchangedCount + 2;
        this._maxY = dots * this._dotDiameter;
    }

    _initScales() {
        this._x = d3.scalePoint()
            .domain(this._seq(0, this._chartData.length))            
            .range([0, this._width - this._leftMargin]);
        this._y = n => n * this._dotDiameter;

        this._cp = d3.scaleSequential(this._options.posPalette).domain([this._pMin, this._pMax]).nice().clamp(true);
        this._cn = d3.scaleSequential(this._options.negPalette).domain([this._nMax, this._nMin]).nice().clamp(true);

        this._initRankScale();
        this._initUnchangedScale();
    }

    _initRankScale() {
        /*
         * // Buggy dynamic scale
        var
            a = this._rMax, b = this._rMin,
            s = 0, l = 0;

        // the rank is never going to be zero:
        // 1 ~ n for pos
        // -1 ~ -n for neg
        // the series only contains postive ranks
        if (a > 0 && b > 0) {
            s = 0;
            l = a - b + 1;
        }
        // the series only contains negative ranks
        else if (a < 0 && b < 0) {
            s = b;
            l = Math.abs(b) - Math.abs(a) + 1;
        }
        // from positive to negative
        else {
            s = b;
            l = a - b;
        }        
        
        // Max offset should always equal to |_rMin|
        // This check avoids the difference caused by unchanged dots
        var sm = this._shift.max.offset;
        if (this._options.isolateUnchanged && sm != Math.abs(this._rMin)) sm = Math.abs(this._rMin);

        this._rk = d3.scalePoint()
            .domain(this._seq(s, l).reverse())
            .range([this._y(this._shift.min.offset), this._y(sm + this._keys.length)]);
        */

        const len = this._keys.length;
        this._rk = d3.scalePoint()
            .domain(this._seq(-len, len * 2 + 1).reverse())
            .range([this._y(0), this._y(len* 2)]);
    }

    _initUnchangedScale() {
        const maxDataLen = this._shift.max.data ? this._keys.length : 0;
        var bottom = 0;
        if (this._shift.max.offset === 0)
            bottom = (this._keys.length + 2) * this._dotDiameter;
        else
            bottom = this._y(this._shift.max.offset) + (maxDataLen + 2) * this._dotDiameter;

        this._yu = d3.scalePoint()
            .domain(this._seq(0, this._maxUnchangedCount))
            .range([bottom + (this._maxUnchangedCount - 1) * this._dotDiameter, bottom]);
    }

    _render() {        
        if (this._options.debug) {
            //Boundry for debugging
            this._container
                .append("rect")
                .attr("width", this._width).attr("height", this._height)
                .attr("stroke-width", 0.1)
                .attr("fill", "none")
                .attr("stroke", "black");
        }            

        this._renderGroups();
        this._renderDots();
        this._renderRankAxis();
        this._renderUnchangedLabel();
        this._renderXAxis();
        this._renderLegend();
        if (this._options.showSlider) this._renderSlider();
    }

    _renderGroups() {
        const that = this;

        this._container
            .on("click.eric.trendchart." + this._uniqueId, () => {
                if (this._options.clickAction === "none") return;
                this._focusedKey = this._focusedRange = null;
                this._cancel();
                this._cancelRange();
            });

        // Container group
        // Contains main chart group, slider group and legend group
        this._cg = this._container
            .append("g")
            .attr("font-family", this._options.fontFamily)
            .attr("font-size", this._options.fontSize);

        // Main chart group
        this._g = this._cg.append("g")
            .attr("transform", `translate(${this._leftMargin - this._dotRadius},${this._legendHeight})`)
            .on("mouseleave", (e, d) => { this._highlighter.attr("opacity", 0); });

        // Period groups
        this._og = this._g
            .selectAll("g")
            .data(this._chartData)
            .enter().append("g")
            .attr("transform", (d, i) => `translate(${this._x(i)},${this._innerMargin})`)
            .on("mouseenter", function(e, d) {
                const i = that._og.nodes().indexOf(this);
                that._highlighter.attr("opacity", (_, j) => i === j ? 1 : 0);
            });

        this._highlighter = this._og
            .append("rect")
            .attr("class", "highlighter")
            .attr("opacity", 0)
            .attr("fill", this._color.highlighter)
            .attr("rx", 4).attr("ry", 4)
            .attr("x", -this._dotRadius).attr("y", -this._dotRadius)
            .attr("width", this._dotRadius * 2)
            .attr("height", this._maxY);

        this._ig = this._og.append("g").attr("class", "ig");
        this._shiftColumn(this._ig);
    }

    _shiftColumn(selection, transition) {
        const s = transition ?
            selection.transition().ease(d3.easeElastic).duration(1000) :
            selection;

        s.attr(
                "transform",
                d => {
                    var unchanged = 0, under = 0;
                    if (this._options.isolateUnchanged) {
                        for (var i = 0; i < d.values.length; i++) {
                            const
                                n = this._getValue(d.values[i]),
                                g = this._isNumber ? d.values[i].growth : n;
                            if (g === 0) unchanged++;
                            else if (n < this._level) under++;
                        }
                    }
                    else {
                        under = d.values.filter(v => this._getValue(v) <= this._level).length;
                    }
                    return `translate(0,${this._y(under + unchanged)})`;
                }
            );
    }

    _updateDots() {
        this._og.data(this._chartData);
        this._shiftColumn(this._og.select(".ig"), true);
        this._renderDots(true);
    }

    _renderDots(transition) {
        const
            options = this._options,
            level = this._level;

        // Positive dots
        this._renderSection(this._ig,
            "pos",
            v => {
                const
                    n = this._getValue(v),
                    g = this._isNumber ? v.growth : n;
                return options.isolateUnchanged ? g !== 0 && n >= level : n >= level;
            },
            this._y, this._cp, transition);

        // Negative dots
        this._renderSection(
            this._ig,
            "neg",
            v => {
                const
                    n = this._getValue(v),
                    g = this._isNumber ? v.growth : n;
                return options.isolateUnchanged ? g !== 0 && n < level : n < level;
            },
            this._y, this._cn, transition);

        // Unchanged dots
        if (options.isolateUnchanged) {
            this._renderSection(
                this._og,
                "zero",
                v => v.growth === 0,
                this._yu, this._color.unchanged, transition);
        }

        this._dots = this._og.selectAll(".pos,.neg");
    }

    _renderSection(g, className, filter, y, color, transition) {
        let shape = "circle";
        if (this._options.shape === "square") shape = "rect";
        return g
            .selectAll("." + className)
            .data(d => d.values.filter(filter))
            .join(
                enter =>
                    this._drawShape(
                        this._attachEvents(
                            this._updateShape(
                                enter.append("g").attr("class", className),
                                y, color
                            )
                        ).append(shape),                        
                        transition
                    ),
                update => this._updateShape(update, y, color),
                exit => exit.remove()
            );
    }

    _updateShape(selection, y, c) {
        if (typeof c === "function")
            selection.attr("fill", d => c(this._getValue(d)));
        else
            selection.attr("fill", c);

        if (this._isCircle)
            selection.attr("transform", (d, i) => `translate(0,${y(d.pos || i)})`);
        else
            selection.attr("transform", (d, i) => `translate(0,${y(d.pos || i) - this._dotRadius})`);
        return selection;
    }

    _drawShape(selection, transition) {
        if (this._isCircle)
            (transition ? selection.attr("r", 0).transition().duration(500) : selection).attr("r", this._dotRadius);
        else {
            selection
                .attr("width", this._dotDiameter).attr("height", 0)
                .attr("x", -this._dotRadius)
                .attr("rx", 4).attr("ry", 4);
            (transition ? selection.transition().duration(500) : selection).attr("height", this._dotDiameter);
        }
        return selection;
    }

    _attachEvents(selection) {
        selection
            .on("mouseenter", (e, d) => {
                if (!this._focusedKey) this._highlight(d);
                this._showTooltip(e, d);
                if (this._onhover) this._onhover(d);
            })
            .on("mouseleave", (e, d) => {
                if (!this._focusedKey) this._cancel(d)
                this._hideTooltip();
            })
            .on("click", (e, d) => {
                if (this._options.clickAction === "none") return;

                if (this._focusedKey === d) {
                    this._focusedKey = null;
                    this._cancel();
                    if (this._oncancel) this._oncancel(d);
                }
                else {
                    this._focusedKey = d;
                    this._cancel();
                    this._highlight(d);
                    if (this._onclick) this._onclick(d);
                }
                e.stopPropagation();
            });
        return selection;
    }

    _highlight(d) {
        const hc = this._og
            .selectAll("g")
            .filter(_ => _ && _.key === d.key)
            .append("circle")
            .attr("class", "hc")
            .attr("stroke", "white")
            .attr("fill", "black");
        if (!this._isCircle) hc.attr("cy", this._dotRadius);

        hc.transition().duration(250)
          .attr("r", this._dotRadius / 2);
    }

    _cancel() {
        this._og.selectAll(".hc").remove();
    }

    _showTooltip(e, d) {
        const info = [
            d.tick,
            d.key,
            `Number: ${d.number}`,            
            `Growth: ${d.index === 0 ? "-" : d.growth || "-"}`,
            "Growth Rate: " + (d.index !== 0 && d.rate ? `${(d.rate * 100).toFixed(2)}%` : "-")
        ];

        var max = 0;
        info.forEach(s => {
            const l = this._calcTextLength(s);
            if (l > max) max = l;
        })

        if (!this._infoBox)
            this._infoBox = this._g
                .append("g")
                .attr("fill", this._tooltip.color)                
                .call(g => g.append("rect")
                    .attr("class", "ibbg")
                    .attr("opacity", this._tooltip.boxOpacity)
                    .attr("stroke", "#aaa")
                    .attr("stroke-width", 0.5)
                    .attr("rx", 4).attr("ry", 4)
                    .attr("x", -5).attr("y", -5)                    
                    .attr("fill", this._tooltip.boxColor));

        const spacing = 1.1;
        this._infoBox
            .style("visibility", "visible")
            .select(".ibbg")
            .attr("width", max + 15).attr("height", spacing * this._charBox.height * info.length + 5);
                
        this._infoBox
            .selectAll("text")
            .data(info)
            .join(
                enter => enter.append("text").attr("dy", (d, i) => `${spacing * i + 1}em`).text(d => d),
                update => update.text(d => d),
                exit => exit.remove()
            );

        const svg = this._getSVG();
        if (svg) {
            // convert to SVG coordinates
            const
                p = svg.createSVGPoint(),
                box = this._infoBox.node().getBBox(),
                gr = this._g.node().getBoundingClientRect(),
                dr = e.currentTarget.getBoundingClientRect();
            p.x = dr.left + dr.width + this._dotRadius;
            p.y = dr.top + dr.width + this._dotRadius;
            const converted = p.matrixTransform(this._g.node().getScreenCTM().inverse());

            const
                left = converted.x + box.width + gr.left + this._dotRadius > this._width ? converted.x - box.width - this._dotDiameter : converted.x,
                top = converted.y + box.height + gr.top + this._dotRadius > this._height ? converted.y - box.height - this._dotDiameter : converted.y;

            this._infoBox.attr("transform", `translate(${left},${top})`);
        }
    }

    _getSVG() {
        let curr = this._container.node();
        while (curr && curr.tagName !== "svg")
            curr = curr.parentElement;
        return curr;
    }

    _hideTooltip(d) {
        if (this._infoBox) this._infoBox.style("visibility", "hidden");
    }    

    _renderRankAxis() {
        const ticks = d3
            .axisLeft(this._rk)
            .tickValues(this._rk.domain().filter(d => d % 3 === 0));

        if (this._rankAxis) this._rankAxis.remove();

        this._rankAxis = this._g
            .append("g")
            .attr("transform", `translate(${-this._dotRadius}, ${this._innerMargin - this._dotRadius})`)
            .call(ticks)
            .call(g => {
                g.attr("font-family", this._options.font).attr("font-size", this._tick.fontSize);
                g.select(".domain").remove();
                g.selectAll(".tick").select("line").attr("stroke", this._tick.color);
                g.selectAll(".tick text").attr("fill", this._tick.color);
            });

        const y = this._rk(0) + this._innerMargin - this._dotRadius;
        if (y && !this._zeroLine) {
            this._zeroLine = this._g
                .append("line")
                .attr("stroke-width", 0.5)
                .attr("stroke", this._tick.color)
                .attr("stroke-dasharray", "3")
                .attr("x1", -this._dotRadius).attr("x2", this._x.range()[1] + this._dotRadius);                
        }
        if (this._zeroLine) this._zeroLine.attr("y1", y).attr("y2", y);
    }

    _renderUnchangedLabel() {
        if (this._options.isolateUnchanged && this._maxUnchangedCount > 0) {
            if (!this._uncLabel)
                this._uncLabel = this._g
                    .append("text")
                    .attr("fill", this._tick.color)
                    .text("Unchanged");

            const ty = this._maxY + this._innerMargin;
            if (ty + this._legendHeight + this._charBox.height > this._height)
                this._uncLabel
                    .attr("dy", "-0.5em")
                    .attr("text-anchor", "end")
                    .attr("transform", `translate(${-this._dotRadius},${ty - this._dotRadius})`);
            else
                this._uncLabel
                    .attr("dy", "0.25em")
                    .attr("text-anchor", "start")
                    .attr("transform", `translate(${-this._dotRadius},${ty})`);
        }
    }

    _processLegend() {
        const
            that = this,
            ticks = [],
            ts = this._cn.ticks()
                .concat(this._cp.ticks())
                .sort((a, b) => a - b);
        for (let i = 0; i < ts.length - 1; i += 3) addTick(i);
        const last = ts[ts.length - 1];
        if (ticks[ticks.length - 1].floor != last && last <= this._pMax) addTick(ts.length - 1);

        let legendWidth = 0;
        ticks.forEach(d => {
            let len = this._calcTextLength(d.label);
            if (len > legendWidth) legendWidth = len;
        });
        legendWidth += 10;

        return { ticks, legendWidth };

        function addTick(i) {
            const floor = ts[i];
            ticks.push({
                floor: floor,
                ceiling: i + 3 < ts.length ? ts[i + 3] : Number.POSITIVE_INFINITY,
                color: floor < that._level ? that._cn(floor) : that._cp(floor),
                label: formatLabel(floor)
            });
        }

        function formatLabel(n) {
            return that._isRate ? d3.format(".1f")(n * 100) : d3.format(".2s")(n);
        }
    }

    _renderLegend() {        
        const
            that = this,
            { ticks, legendWidth } = this._processLegend();

        if (!this._legendBox) this._legendBox = this._cg.append("g");        
            
        this._legendBox
            .attr("transform", `translate(${this._width - ticks.length * legendWidth},0)`)
            .selectAll("g")
            .data(ticks)
            .join(
                enter => {
                    const g = enter
                        .append("g")
                        .attr("transform", (d, i) => `translate(${i * legendWidth},0)`)
                        .call(g => g
                            .append("line")
                            .attr("x1", 0.5).attr("x2", 0.5)
                            .attr("y1", "1em").attr("y2", "1.3em")
                            .attr("stroke-width", 0.5)
                            .attr("stroke", this._color.legend)
                        )
                        .on("mouseenter", (e, d) => { if (!this._focusedRange) this._highlightRange(d); })
                        .on("mouseleave", () => { if (!this._focusedRange) this._cancelRange(); })
                        .on("click", (e, d) => {
                            if (this._options.clickAction === "none") return;

                            if (this._focusedRange === d) {
                                this._focusedRange = null;
                                this._cancelRange();
                            }
                            else {
                                this._focusedRange = d;
                                this._cancelRange();
                                this._highlightRange(d);
                            }
                            e.stopPropagation();
                        });


                    updateLegend(
                        g.append("rect").attr("width", legendWidth).attr("height", "1em"),
                        g.append("text").attr("fill", this._color.legend).attr("dy", "2.2em")
                    );
                },
                update => updateLegend(update.select("rect"), update.select("text")),
                exit => exit.remove());            
        
        function updateLegend(rect, text) {
            rect.attr("fill", d => d.color);
            text.text((d, i) => {
                const last = i === ticks.length - 1;
                return (last ? ">" : "") + d.label + (last && that._isRate ? "%" : "");
            });
        }        
    }

    _highlightRange(d) {             
        this._dots.attr("opacity", _ => {
            const n = this._getValue(_);
            return n >= d.floor && n < d.ceiling ? 1 : 0.3;
        });
    }

    _cancelRange() {
        this._dots.attr("opacity", 1);        
    }

    _renderSlider() {
        const      
            that = this,
            height = this._keys.length * 2 * this._dotDiameter,
            top = this._legendHeight + this._innerMargin - this._dotRadius;

        var inputGroup = this._cg
            .append("g");
            // Doesn't work in Safari
            //.attr("transform", `translate(0,${top})`);

        const label = inputGroup
            .append("text")
            .attr("y", 0)
            .attr("fill", this._tick.color)
            .attr("text-anchor", "middle")
            .text(this._level);

        const vbox = label.node().getBBox();
        label
            .attr("x", vbox.height)
            .attr("transform", `rotate(270,${vbox.height},0)`)
            .text("");

        const
            min = this._nMin > 0 ? this._nMin / 1.01 : this._nMin * 1.01,
            max = this._pMax * 1.01,
            step = Math.abs(min) / 100;

        const fo = inputGroup
            .append("foreignObject")
            .attr("x", this._charBox.height).attr("y", top)
            .attr("width", 20).attr("height", height + 2);

        const slider = fo
            .append("xhtml:input")
            .attr("type", "range")
            .attr("min", min).attr("max", max)
            .attr("step", step)
            .style("width", `${height}px`).style("height", "20px")
            .style("transform-origin", "10px 10px")
            .style("transform", "rotate(90deg)")
            .on("click", e => e.stopPropagation())
            .on("dblclick", e => {
                slider.node().value = this._defaultLevel;
                change();
                e.stopPropagation();
            })
            .on("input", () => change());

        // This fixes a weird behavior if both min and max are floating poing numbers
        slider.node().value = this._level;

        function change() {
            var
                tw = label.node().getBBox().width,
                hw = tw / 2;

            var v = parseFloat(slider.node().value);
            var p = Math.abs(max - v);
            var ty = height - p / (max - min) * height + top;

            if (ty + hw - top > height) ty = height - hw + top;
            else if (ty - hw - top <= 0) ty = hw + top;

            var vtext = "Number < ";
            if (that._isGrowth) vtext = "Growth < ";
            else if (that._isRate) vtext = "Growth Rate < "
            const dv = that._isRate ? v * 100 : v;
            vtext += !that._isRate ? dv.toFixed(0) : dv.toFixed(2) + (that._isRate ? "%" : "");

            label
                .attr("y", ty)
                .attr("transform", `rotate(270,${vbox.height},${ty})`)
                .text(vtext);
            that._level = v;
            that._changeLevel();
        }
    }

    _changeLevel() {
        this._pMin = 0;
        this._pMax = 0;
        this._nMin = 0;
        this._nMax = 0;
        this._rMin = 0;
        this._rMax = 0;

        this._process(true);
        this._calcShift();
        this._calcMaxY();
        this._initScales();

        this._updateDots();
        //this._renderRankAxis();
        this._renderUnchangedLabel();
        this._renderLegend();
        this._highlighter.attr("height", this._maxY);

        if (this._focusedKey) {            
            this._cancel();
            this._highlight(this._focusedKey);
        }
        if (this._focusedRange) {
            this._cancelRange();
            this._highlightRange(this._focusedRange);
        }
    }

    _renderXAxis() {                
        var max = 0;
        const
            range = this._x.range(),
            scale = d3.scalePoint()
                .domain(this._chartData
                    .map(d => {                        
                        const len = this._calcTextLength(d.tick);
                        if (len > max) max = len;
                        return d.tick;
                    }))
                .range(range);

        var intr;
        if (this._tick.interval === "auto") {
            const c = Math.floor((range[1] - range[0]) / max / 2);
            intr = Math.ceil(this._chartData.length / c);
        }
        else intr = +this._tick.interval;

        var ticks = d3
            .axisTop(scale)
            .tickValues(scale.domain().filter((d, i) => i % intr === 0));

        const ex = this._tick.extractor;
        this._g.append("g")
            .attr("fill", this._tick.color)            
            .selectAll("g")
            .data(ticks.tickValues())
            .enter().append("g")
            .attr("transform", d => `translate(${scale(d) - this._dotRadius},0)`)
            .call(g => {
                g
                    .append("text")
                    .attr("dy", "1em")
                    .attr("dx", 3)                                        
                    .text(d => ex && typeof ex === "function" ? ex(d) : d);
            })
            .call(g => {
                g
                    .append("line")
                    .attr("stroke-width", 0.5)
                    .attr("stroke", this._tick.color)
                    .attr("stroke-dasharray", "3")
                    .attr("y1", 0).attr("y2", this._maxY);
            });
    }

    _getValue(d) {
        return this._isNumber ? d.number : this._isGrowth ? d.growth : d.rate;
    }

    _getCharBox() {
        this._charBox = this._textBox.text("M").node().getBBox();
    }

    _calcTextLength(text) {
        return this._textBox.text(text).node().getBBox().width;
    }

    _seq(start, length) {
        const a = new Array(length);
        for (let i = 0; i < length; i++) a[i] = i + start;
        return a;
    }
}