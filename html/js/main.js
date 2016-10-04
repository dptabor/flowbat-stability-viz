/* global d3 */

let DATA_URL = 'data/example_data.json'

function main () {
  let viz = new PourvaixViz()
  d3.json(DATA_URL, function onLoadData (data) {
    viz.setState({data})
  })
}

class PourvaixViz {
  constructor () {
    this.dimensions = this.genDimensions()
    this.svgRoot = this.genSvgRoot({dimensions: this.dimensions})
    this.chartRoot = this.genChartRoot({svgRoot: this.svgRoot,
                                       dimensions: this.dimensions})
    this.scales = {}
    this.state = {}
  }

  genSvgRoot ({dimensions}) {
    let svgRoot = d3.select('body').append('svg')
      .attr('width', dimensions.outer.width)
      .attr('height', dimensions.outer.height)
      .append('g')
      .attr('transform',
            `translate(${dimensions.margin.left}, ${dimensions.margin.top})`)
    svgRoot.append('rect')
      .attr('class', 'outer')
      .attr('width', dimensions.inner.width)
      .attr('height', dimensions.inner.height)
    return svgRoot
  }

  genDimensions () {
    let margin = {top: 20, right: 20, bottom: 20, left: 20}
    let padding = {top: 60, right: 60, bottom: 60, left: 60}
    let outer = {width: 960, height: 500}
    let inner = {
      width: (outer.width - (margin.left + margin.right)),
      height: (outer.height - (margin.top + margin.bottom)),
    }
    let chart = {
      width: (inner.width - (padding.left + padding.right)),
      height: (inner.height - (padding.top + padding.bottom)),
    }
    return { margin, padding, outer, inner, chart }
  }

  genChartRoot ({svgRoot, dimensions}) {
    let chartRoot = svgRoot.append('g')
      .attr('transform',
            `translate(${dimensions.padding.left}, ${dimensions.padding.top})`)
    chartRoot.append('rect')
      .attr('class', 'inner')
      .attr('width', dimensions.chart.width)
      .attr('height', dimensions.chart.height)
    return chartRoot
  }

  setState (newProps) {
    let prevState = this.state
    this.state = Object.assign({}, this.state, newProps)
    this.onChangeState(prevState, this.state)
    this.render()
  }

  onChangeState (prevState) {
    this.updateScales(this.state)
  }

  updateScales (state) {
    let scales = {}
    let scaleCfgs = [
      {key: 'ph', range: [0, this.dimensions.chart.width]},
      {key: 'ev', range: [0, this.dimensions.chart.height], invertDomain: true,
        fixedBounds: {min: 0}}
    ]
    let combinedPoints = [...this.getStabilityWindowPoints(state),
      ...this.getCombinedMoleculePoints(state)]
    for (let scaleCfg of scaleCfgs) {
      let scaleValues = []
      for (let point of combinedPoints) {
        scaleValues.push(point[scaleCfg.key])
      }
      let calculatedBounds = {
        min: d3.min(scaleValues),
        max: d3.max(scaleValues),
      }
      let scaleBounds = Object.assign(calculatedBounds, scaleCfg.fixedBounds)
      scales[scaleCfg.key] = d3.scaleLinear()
        .range(scaleCfg.range)
        .domain((scaleCfg.invertDomain) ?
               [scaleBounds.max, scaleBounds.min] :
               [scaleBounds.min, scaleBounds.max])
    }
    this.scales = scales
  }

  getStabilityWindowPoints (state) {
    return state.data.stability_window.points
  }

  getCombinedMoleculePoints (state) {
    let combinedMoleculePoints = []
    for (let molecule of state.data.molecules) {
      combinedMoleculePoints = [...combinedMoleculePoints, ...molecule.points]
    }
    return combinedMoleculePoints
  }

  render () {
    this.renderAxes()
    this.renderMolecules()
  }

  renderAxes () {
    this.axes = {
      ph: d3.axisBottom().scale(this.scales.ph),
      ev: d3.axisRight().scale(this.scales.ev),
    }

    this.chartRoot
      .append('g')
        .classed('ph axis', true)
        .attr('transform', `translate(0, ${this.dimensions.chart.height})`)
      .call(this.axes.ph)

    this.chartRoot
      .append('g')
        .classed('ev axis', true)
        .attr('transform', `translate(${this.dimensions.chart.width},0)`)
    .call(this.axes.ev)
  }

  renderMolecules () {
    for (let molecule of this.state.data.molecules) {
      this.renderMolecule(molecule)
    }
  }

  renderMolecule (molecule) {
    let moleculeG = this.chartRoot.append('g')
      .classed(`molecule ${molecule.id}`, true)
    let commonKwargs = {
      container: moleculeG,
      points: molecule.points,
      xFn: d => this.scales.ph(d.ph),
      yFn: d => this.scales.ev(d.ev),
    }
    this.renderCurve(Object.assign({
      classes: 'curve'
    }, commonKwargs))
    this.renderPoints(Object.assign({
      classes: 'points',
      radius: 2,
    }, commonKwargs))
  }

  renderCurve (kwargs = {}) {
    let {classes, container, points, xFn, yFn} = kwargs
    let curve = container.append('path')
      .datum(points)
      .classed(classes || '', true)
      .attr('d', d3.line().x(xFn).y(yFn))
    return curve
  }

  renderPoints (kwargs = {}) {
    let {classes, container, points, radius, xFn, yFn} = kwargs
    let pointsG = container.append('g')
      .classed(classes || '', true)
    let pointEls = pointsG.selectAll('circle').data(points)
    pointEls.enter()
      .append('circle')
      .attr('cx', xFn)
      .attr('cy', yFn)
      .attr('r', radius)
    return pointsG
  }
}

main()
