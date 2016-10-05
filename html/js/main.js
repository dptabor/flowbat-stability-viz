/* global d3, $ */

let DATA_URL = 'data/example_data.json'

let fakeData = {
  stability_window: {
    points: [
      {ph: 0, ev: 1.230},
      {ph: 14, ev: 0.404},
      {ph: 14, ev: -0.826},
      {ph: 0, ev: 0.118}
    ]
  },
  molecules: [...Array(3).keys()].map((i) => ({
    id: `molecule-${i}`,
    label: `Molecule_${i}`,
    tags: [1, 2, 3].map(t => `tag_${i}_${t}`),
    points: [...Array(12).keys()].map((j) => ({
      ph: j, ev: (1.5 - 1.5 * Math.random())
    }))
  }))
}

function main () {
  let viz = new PourvaixViz()
  /*
  d3.json(DATA_URL, function onLoadData (data) {
    viz.setState({data})
  })
  */
  viz.setState({data: fakeData})
}

class PourvaixViz {
  constructor () {
    this.dimensions = this.genDimensions()
    this.appRoot = this.genAppRoot()
    this.svgRoot = this.genSvgRoot({
      dimensions: this.dimensions,
      parent: this.appRoot.select('#left-panel')
    })
    this.chartRoot = this.genChartRoot({svgRoot: this.svgRoot,
                                       dimensions: this.dimensions})
    this.selectorRoot = this.genSelectorRoot({
      parent: this.appRoot.select('#right-panel')
    })
    this.dataTable = this.genDataTable({parent: this.selectorRoot})
    this.scales = {}
    this.state = {
      moleculeSelection: {},
    }
  }

  genAppRoot () {
    let appRoot = d3.select('body').append('div')
      .attr('id', 'app-root')
    appRoot.append('div').attr('id', 'left-panel')
    appRoot.append('div').attr('id', 'right-panel')
    return appRoot
  }

  genDimensions () {
    let margin = {top: 0, right: 0, bottom: 0, left: 0}
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

  genSvgRoot ({dimensions, parent}) {
    let svgRoot = parent.append('svg')
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

  genChartRoot ({svgRoot, dimensions}) {
    let chartRoot = svgRoot.append('g')
      .classed('chart-root', true)
      .attr('transform',
            `translate(${dimensions.padding.left}, ${dimensions.padding.top})`)
    chartRoot.append('rect')
      .attr('class', 'inner')
      .attr('width', dimensions.chart.width)
      .attr('height', dimensions.chart.height)
    return chartRoot
  }

  genSelectorRoot ({parent}) {
    let selectorRoot = parent.append('div')
    selectorRoot.append('h4').html('Molecules')
    return selectorRoot
  }

  genDataTable ({parent}) {
    let dataTableId = 'datatable'
    parent.append('table').attr('id', dataTableId)
    let table = $(`#${dataTableId}`)
    let dataTable = table.DataTable({
      buttons: [
        {
          text: 'clear selection',
          action: () => dataTable.rows().deselect()
        }
      ],
      columns: [
        {title: 'Name', data: 'label'},
        {title: 'Tags', data: 'tags'},
      ],
      dom: 'Bfrti',
      paging: false,
      select: {
        style: 'multi',
      }
    })

    let _genSelectionHandler = ({selectionValue}) => {
      let selectionHandler = (e, dt, type, indexes) => {
        let moleculeSet = dataTable.rows(indexes).data().toArray()
        let selectionUpdates = {}
        for (let molecule of moleculeSet) {
          selectionUpdates[molecule.id] = selectionValue
        }
        this._updateMoleculeSelection(selectionUpdates)
      }
      return selectionHandler
    }
    dataTable.on('select', _genSelectionHandler({selectionValue: true}))
    dataTable.on('deselect', _genSelectionHandler({selectionValue: false}))

    return dataTable
  }

  _updateMoleculeSelection (selectionUpdates) {
    let updatedMoleculeSelection = Object.assign(
      {}, this.state.moleculeSelection, selectionUpdates)
    let prunedMoleculeSelection = {}
    for (let moleculeId of Object.keys(updatedMoleculeSelection)) {
      if (updatedMoleculeSelection[moleculeId]) {
        prunedMoleculeSelection[moleculeId] = true
      }
    }
    this.setState({moleculeSelection: prunedMoleculeSelection})
  }

  setState (newProps) {
    let prevState = this.state
    this.state = Object.assign({}, this.state, newProps)
    if (this.shouldUpdate(prevState)) {
      this.onChangeState(prevState, this.state)
    }
  }

  shouldUpdate (prevState) {
    return !this._statesAreEqual(prevState, this.state)
  }

  _statesAreEqual (state1, state2) {
    return (JSON.stringify(state1) === JSON.stringify(state2))
  }

  onChangeState (prevState) {
    this.updateScales(this.state)
    this.render()
  }

  updateScales (state) {
    let scales = {}
    let scaleCfgs = [
      {key: 'ph', range: [0, this.dimensions.chart.width],
        genBounds: (calculatedBounds) => calculatedBounds},
      {key: 'ev', range: [0, this.dimensions.chart.height], invertDomain: true,
        genBounds: (calculatedBounds) => Object.assign(
          {}, calculatedBounds, {min: d3.min([0, calculatedBounds.min])})
      }
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
      let bounds = scaleCfg.genBounds(calculatedBounds)
      scales[scaleCfg.key] = d3.scaleLinear()
        .range(scaleCfg.range)
        .domain((scaleCfg.invertDomain) ?
               [bounds.max, bounds.min] : [bounds.min, bounds.max])
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
    console.log('render', this.state)
    this.renderAxes()
    this.renderStabilityWindow()
    let molecules = this.state.data.molecules
    this.renderMoleculesInChart(molecules)
    this.renderMoleculesInDataTable(molecules)
  }

  renderAxes () {
    this.axes = {
      ph: d3.axisBottom().scale(this.scales.ph),
      ev: d3.axisRight().scale(this.scales.ev),
    }

    let axesSelection = this.chartRoot.selectAll('.axes').data([null]).enter()
      .append('g')
      .classed('axes', true)
    axesSelection.append('g')
      .classed('ph axis', true)
      .attr('transform', `translate(0, ${this.dimensions.chart.height})`)
      .call(this.axes.ph)
    axesSelection.append('g')
      .classed('ev axis', true)
      .attr('transform', `translate(${this.dimensions.chart.width},0)`)
      .call(this.axes.ev)
  }

  renderStabilityWindow () {
    let points = this.state.data.stability_window.points
    let xFn = d => this.scales.ph(d.ph)
    let yFn = d => this.scales.ev(d.ev)
    let stabilityWindowSelection = this.chartRoot.selectAll('.stability-window')
      .data([null]).enter()
    stabilityWindowSelection.append('g')
      .classed('stability-window', true)
      .append('path')
        .classed('outline', true)
    stabilityWindowSelection.select('.outline')
      .datum(points)
      .attr('d', d3.line().x(xFn).y(yFn))
    return stabilityWindowSelection
  }

  renderMoleculesInChart (molecules) {
    for (let molecule of molecules) {
      this.renderMoleculeInChart(molecule)
    }
  }

  renderMoleculeInChart (molecule) {
    let curveClass = 'curve'
    let pointsClass = 'points'
    let xFn = d => this.scales.ph(d.ph)
    let yFn = d => this.scales.ev(d.ev)

    let updateSelection = this.chartRoot.selectAll(`.${molecule.id}`)
      .data([molecule], d => d.id)
    let enterSelection = updateSelection.enter()
      .append('g')
        .classed(`molecule ${molecule.id}`, true)
    enterSelection.append('path').classed(curveClass, true)
    enterSelection.append('g').classed(pointsClass, true)

    let mergeSelection = enterSelection.merge(updateSelection)
    mergeSelection.classed('selected', this._moleculeIsSelected(molecule))

    mergeSelection.selectAll(`.${curveClass}`)
      .attr('d', d3.line().x(xFn).y(yFn)(molecule.points))

    let pointRadius = 2
    let circleSelection = mergeSelection.selectAll(`.${pointsClass}`)
      .selectAll('circle').data(molecule.points)
    circleSelection.enter().append('circle')
      .merge(circleSelection)
        .attr('cx', xFn)
        .attr('cy', yFn)
        .attr('r', pointRadius)
  }

  renderMoleculesInDataTable (molecules) {
    this.dataTable.clear()
    this.dataTable.rows.add(molecules)
    this.dataTable.rows().eq(0).each((index) => {
      let row = this.dataTable.row(index)
      let molecule = row.data()
      if (this._moleculeIsSelected(molecule)) { row.select() }
    })
    this.dataTable.draw(false)
  }

  _moleculeIsSelected (molecule) {
    return this.state.moleculeSelection[molecule.id]
  }

}

$(document).ready(function () {
  main()
})
