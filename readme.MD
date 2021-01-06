# Performance Chart


The **PerformanceChart** depicts the evolution of time-series categorical data by segmenting categories into two sections based on their performance. It is beneficial for tracking overall and individual changes over time. The chart sorts categories by the change from the previous period, then segments them into rising and falling sections. Dots in each section are shaded using individual color scheme to emphasize the visual aspect of interpretation.

For live demos and sample codes, please see [Performance Chart](https://observablehq.com/@analyzer2004/performance-chart)

<img src="https://github.com/analyzer2004/timespiral/blob/master/images/cover.png" width="768">

## API Reference
* **PerformanceChart(container)** - Constructs a new instance of PerformanceChart with default settings. The container can be an svg or g element.
* **size(_)** - Sets the dimensions of the chart to specified width, height and returns this chart.
* **options(options)** - Overrides the default settings and returns this chart.
  * options.**number** - sets the measure to *"value"*, *"growth"* or *"growth rate"*. Default if growth.
  * options.**isolateUnchanged** - specifies whether the unchanged dots should be isolated into the unchanged section.
  * options.**posPalette** - sets the color palette of positive (rising) section to the specified continous interpolator.
  * options.**negPalette** - sets the color palette of negative (falling) section to the specified continous interpolator.
  * options.**shape** - sets the shape of dots to *"circle"* or *"square"*. Default is circle.
  * options.**clickAction** - specifies the click action to *"none"* or *"highlight"*. Default is highlight.
  * options.**showSlider** - specifies whether the slider is enabled.
  * options.**fontFamily** - sets the font. Default is sans-serif.
  * options.**fontSize** - sets the font size. Default is 10px.
* **tick(tick)** - Overrides the tick settings and returns this chart.
  * tick.**name** - sets the column name of ticks    
  * tick.**fontSize** - sets the tick's font size
  * tick.**color** - sets the tick's text color
  * tick.**interval** - sets the interval of x-axis to "auto" or a number. Default is auto.
  * tick.**extractor** - sets the function for extracting tick string. See the first demo for usage.
  * tick.**color** - sets the color of tick texts and lines.
* **tooltip(tooltip)** - Overrides the tooltip settings and returns this chart.
  * tooltip.**color** - sets the text color of tooltip.
  * tooltip.**boxColor** - sets the background color of the tooltip box.
  * toolyip.**boxOpacity** - sets the opacity of the tooltip box. Default is 0.8.
* **color(color)** - Overrides the color settings and returns this chart.
  * color.**legend** - sets the text color of legend.
  * color.**highlighter** - sets the color of highlighter.
  * color.**unchanged** - sets the color of unchanged dots.
* **data(_)** - Sets the data and returns this chart.
* **render()** - Renders the chart and returns it's instance.
* **onhover(d)** - Occurs when user hover over a dot.
* **onclick(d)** - Occurs when user click on a dot.
* **oncancel(d)** - Occurs when cancelling the locked highlight.`