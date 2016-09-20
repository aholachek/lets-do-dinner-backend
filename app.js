


class PreferencesPanel extends React.Component {

  render(){

    return <div>
      
    </div>

  }

}


class MatchesMap extends React.Component {

  render(){

  }

}

class MatchesList extends React.Component {

  render(){
    return (
      <div>
        <h3>matches</h3>
      </div>
    )
  }

}

class Container extends React.Component {

  renderPreferences () {
    _.range(0,5).map(function(i){
      return <PreferencesPanel/>
    })
  }

  render () {
    return (
      <div class="ui grid">
        <div>
          { this.renderPreferences() }
        </div>
        <div>
          <button className="ui button">calculate</button>
        </div>
        <div>
          <MatchesMap/>
          <MatchesList list={matchesList}/>
        </div>
      </div>
    )

  }


}


ReactDOM.render(
  <h1>Hello, world!</h1>,
  document.getElementById('app')
);
