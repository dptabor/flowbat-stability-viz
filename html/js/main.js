/* global d3, $ */

function main (kwargs = {}) {
  let {dataPromise, renderDataSource} = kwargs
  let viz = new PourvaixViz({renderDataSource})
  dataPromise.then(data =>  viz.setState({data}))
}

class PourvaixViz {
  constructor (kwargs = {}) {
    this.renderDataSource = kwargs.renderDataSource
    this.dimensions = this.genDimensions()
    this.appLayout = this.genAppLayout()
    this.setupTooltips()
    this.svgRoot = this.genSvgRoot({
      dimensions: this.dimensions,
      parent: d3.select('#left-panel')
    })
    this.chartRoot = this.genChartRoot({svgRoot: this.svgRoot,
                                       dimensions: this.dimensions})
    this.selectorRoot = this.genSelectorRoot({
      parent: d3.select('#right-panel')
    })
    this.dataTable = this.genDataTable({parent: this.selectorRoot})
    this.scales = {}
    this.state = {
      moleculeSelection: {},
    }
  }

  genAppLayout () {
    let appLayout = d3.select('main').append('div')
      .attr('id', 'app')
    let appHeader = appLayout.append('div').attr('id', 'app-header')
    appHeader.append('div')
      .attr('id', 'data-source-info')
      .html(this.renderDataSource || 'Data source: -not specified-')
    let appBody = appLayout.append('div').attr('id', 'app-body')
    appBody.append('div').attr('id', 'left-panel')
    appBody.append('div').attr('id', 'right-panel')
    return appLayout
  }

  setupTooltips () {
    $('#app-root').on('mouseover', '[title!=""]', function (ev) {
      $(this).qtip({
        overwrite: false, // Make sure the tooltip won't be overridden once created
        hide: {
          event: 'mouseout',
          fixed: true,
        },
        position: {
          adjust: {x: 10}
        },
        show: {
          event: ev.type,
          ready: true,
        }
      }, ev)
    })
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
    let evPadding = 0.1
    let phPadding = 0.1
    let scaleCfgs = [
      {key: 'ph', range: [0, this.dimensions.chart.width],
        genBounds: (calculatedBounds) => ({
          min: calculatedBounds.min - phPadding,
          max: calculatedBounds.max + phPadding,
        })
      },
      {key: 'ev', range: [0, this.dimensions.chart.height], invertDomain: true,
        genBounds: (calculatedBounds) => ({
          min: d3.min([0, calculatedBounds.min - evPadding]),
          max: calculatedBounds.max + evPadding,
        })
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

    let axesEnterSelection = this.chartRoot.selectAll('.axes')
      .data([null]).enter()
      .append('g')
        .classed('axes', true)
    let phAxis = axesEnterSelection.append('g')
      .classed('ph axis', true)
      .attr('transform', `translate(0, ${this.dimensions.chart.height})`)
      .call(this.axes.ph)
    phAxis.append('text')
      .classed('axis-title', true)
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${this.dimensions.chart.width * 0.5},
                                    ${this.dimensions.padding.bottom * 0.6})`)
      .style('font-size', this.dimensions.padding.bottom * 0.3 + 'px')
      .text('pH')
    let ehAxis = axesEnterSelection.append('g')
      .classed('ev axis', true)
      .attr('transform', `translate(${this.dimensions.chart.width},0)`)
      .call(this.axes.ev)
    ehAxis.append('text')
      .classed('axis-title', true)
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(${this.dimensions.padding.right * 0.6},
                                    ${this.dimensions.chart.height * 0.5})
                                    rotate(-90)`)
      .style('font-size', this.dimensions.padding.right * 0.3 + 'px')
      .text('ev')
  }

  renderStabilityWindow () {
    let points = this.state.data.stability_window.points
    let xFn = d => this.scales.ph(d.ph)
    let yFn = d => this.scales.ev(d.ev)
    let stabilityWindowEnterSelection = this.chartRoot.selectAll(
      '.stability-window').data([null]).enter()
        .append('g')
          .classed('stability-window', true)
    stabilityWindowEnterSelection.append('path')
      .classed('outline', true)
      .datum(points)
      .attr('d', d3.line().x(xFn).y(yFn))
    let pointsContainer = stabilityWindowEnterSelection.append('g')
      .classed('points', true)
    let pointClass = 'point'
    let pointEnterSelection = pointsContainer.selectAll(`.${pointClass}`)
      .data(points).enter()
    pointEnterSelection.append('circle')
      .classed(pointClass, true)
      .attr('cx', xFn)
      .attr('cy', yFn)
      .attr('title', p => `[stability window] pH: ${p.ph}, ev: ${p.ev}`)
    return stabilityWindowEnterSelection
  }

  renderMoleculesInChart (molecules) {
    for (let molecule of molecules) {
      this.renderMoleculeInChart(molecule)
    }
  }

  renderMoleculeInChart (molecule) {
    let xFn = d => this.scales.ph(d.ph)
    let yFn = d => this.scales.ev(d.ev)

    let clickHandler = () => this.toggleMolecule(molecule)

    let updateSelection = this.chartRoot.selectAll(`.${molecule.id}`)
      .data([molecule], d => d.id)
    let enterSelection = updateSelection.enter()
      .append('g')
        .classed(`molecule ${molecule.id}`, true)
    let mergeSelection = enterSelection.merge(updateSelection)
    mergeSelection.classed('selected', this._moleculeIsSelected(molecule))

    let curveClass = 'curve'
    let curvePath = d3.line().x(xFn).y(yFn)(molecule.points)
    enterSelection.append('path')
      .classed(curveClass, true)
      .on('click', clickHandler)
    mergeSelection.selectAll(`.${curveClass}`).attr('d', curvePath)

    let pointsClass = 'points'
    enterSelection.append('g').classed(pointsClass, true)
    let pointClass = 'point'
    let pointsSelection = mergeSelection.select(`.${pointsClass}`)
    let pointSelection = pointsSelection
      .selectAll(`.${pointClass}`)
      .data(molecule.points)
    let pointEnterSelection = pointSelection.enter()
      .append('g')
      .classed(pointClass, true)
    let pointMergeSelection = pointEnterSelection.merge(pointSelection)

    let circleRadius = 3
    pointEnterSelection
      .append('circle')
        .attr('r', circleRadius)
        .on('click', clickHandler)
    pointMergeSelection.selectAll('circle')
      .attr('cx', xFn)
      .attr('cy', yFn)
      .attr('title', p => `[${molecule.label}] pH: ${p.ph},
            ev: ${p.ev.toPrecision(2)}`)
  }

  toggleMolecule (molecule) {
    this._updateMoleculeSelection({
      [molecule.id]: !this._moleculeIsSelected(molecule)
    })
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
