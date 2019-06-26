import React, { Component } from "react";
import LayerButtons from "./Components/LayerButtons";
import ReactMapboxGl, { Layer, Feature, Popup } from "react-mapbox-gl";
import { NavigationControl, GeolocateControl } from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import MapboxLanguage from "@mapbox/mapbox-gl-language";
import bbox from "@turf/bbox";
import { lineString } from "@turf/helpers";
import axios from "axios";

// const HERE_APP_ID = "R3EtGwWQmTKG5eVeyLV8";
// const HERE_APP_CODE = "8aDkNeOzfxGFkOKm9fER0A";
const MAPBOX_TOKEN =
  "pk.eyJ1Ijoiam9obmNsYXJ5IiwiYSI6ImNqbjhkZ25vcjF2eTMzbG52dGRlbnVqOHAifQ.y1xhnHxbB6KlpQgTp1g1Ow";
const GEOCODE_DEBUG = false;
const MAP_LANGUAGE = "englishMap";

const Map = ReactMapboxGl({
  accessToken: MAPBOX_TOKEN
});

const layoutLayer = { "icon-image": "marker" };

const geocoderControl = new MapboxGeocoder({
  accessToken: MAPBOX_TOKEN,
  placeholder: "Enter a location here",

  // bounding box restricts results to Travis County
  bbox: [-98.173053, 30.02329, -97.369564, 30.627918],
  // or texas
  // bbox: [65,25.84,-93.51,36.5],
  // or by country:
  // countries: 'us',
  limit: 5,
  trackProximity: true
});

const geolocateControl = new GeolocateControl({
  positionOptions: {
    enableHighAccuracy: true
  },
  trackUserLocation: true
});

export default class SelectLocation extends Component {
  constructor(props) {
    super(props);

    this.locationUpdated = this.locationUpdated.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onStyleLoad = this.onStyleLoad.bind(this);
    this.onMoveEnd = this.onMoveEnd.bind(this);
    this.onDragStart = this.onDragStart.bind(this);
    this.onDragEnd = this.onDragEnd.bind(this);
    this.onForwardGeocodeResult = this.onForwardGeocodeResult.bind(this);
    this.onGeocoderClear = this.onGeocoderClear.bind(this);

    // take location data from the form if it exists, or use a default
    const location = props.value
      ? JSON.parse(props.value)
      : {
          address: "default",
          position: {
            lng: null,
            lat: null
          }
        };

    this.state = {
      center: [location.position.lng, location.position.lat],
      showPin: true,
      geocodeAddressString: location.address,
      formValue: props.value || "",
      lat: "Loading...",
      lng: "Loading...",
      style: "satellite-streets-v9",
      signs: [
        // EX: { id: "Sign 1", lng: -97.7460479736328, lat: 30.266184073558826 },
      ],
      activeSign: "",
      signsArray: [], // This is an array of arrays that turf.js uses to calculate the bounding box
      layersLoaded: true,
      initialLoad: false,
      zoom: ""
    };
  }

  toggleStyle = event => {
    // toggle style based on id of radio button
    if (event.target.checked) {
      const styleClicked = event.target.id;
      this.setState({
        style: styleClicked
      });
    }
  };

  getHeaders = (userToken, appId) => {
    return {
      headers: {
        "X-Knack-Application-Id": appId,
        "X-Knack-REST-API-KEY": "knack",
        Authorization: userToken,
        "content-type": "application/json"
      }
    };
  };

  closePopup = () => {
    this.setState({ activeSign: "" });
  };

  signClick = id => {
    // set state.sign for Popup parameters in render, center map to clicked sign
    const clickedSign = this.state.signs.find(sign => sign.id === id);
    const newCenter = [clickedSign.lng, clickedSign.lat];
    this.setState({
      activeSign: clickedSign,
      center: newCenter
    });
  };

  toggleStyle = event => {
    // toggle style based on id of radio button
    if (event.target.checked) {
      const styleClicked = event.target.id;
      // Switch layersLoaded boolean to force map to render in view upon style update and retain Layer and Features
      this.setState({ layersLoaded: false, style: styleClicked }, () => {
        this.setState({ layersLoaded: true });
      });
    }
  };

  handleChange = event => {
    const state = {};
    state[event.target.name] = event.target.value;
    this.setState(state);
  };

  onForwardGeocodeResult(geocodeResult) {
    const address = geocodeResult.result.place_name;
    this.setState({ geocodeAddressString: address });
  }

  onDragStart() {
    this.setState({
      showPin: false
    });
  }

  onDragEnd() {
    this.setState({
      geocodeAddressString: null,
      showPin: true
    });
  }

  onMoveEnd(map) {
    const center = map.getCenter();
    // Set zoom to retain zoom between Map style changes
    const zoom = map.getZoom();
    this.setState({
      lat: center.lat,
      lng: center.lng,
      zoom: zoom
    });
    this.locationUpdated({
      lngLat: center,
      addressString: this.state.geocodeAddressString
    });
  }

  // calls us-forms-system onChange to propogate values up to the form
  onChange(newFormValue) {
    // onChange below errors upon location selection in map
    // this.props.onChange(newFormValue);
    this.setState({ formValue: newFormValue });
    console.log(this.state.formValue);
  }

  onGeocoderClear() {
    this.onChange({});
  }

  onStyleLoad(map) {
    const language = new MapboxLanguage();
    if (MAP_LANGUAGE === "spanishMap") {
      map.setStyle(language.setLanguage(map.getStyle(), "es"));
    }

    // disable map rotation using right click + drag
    map.dragRotate.disable();
    // disable map rotation using touch rotation gesture
    map.touchZoomRotate.disableRotation();

    const zoomControl = new NavigationControl();
    map.addControl(zoomControl, "bottom-right");
    map.addControl(geocoderControl, "top-left");

    // add geolocate control to map
    map.addControl(geolocateControl, "top-right");

    geocoderControl.on("result", this.onForwardGeocodeResult);

    geocoderControl.on("clear", this.onGeocoderClear);

    function updateGeocoderProximity() {
      // proximity is designed for local scale, if the user is looking at the whole world,
      // it doesn't make sense to factor in the arbitrary centre of the map
      if (map.getZoom() > 9) {
        const center = map.getCenter().wrap(); // ensures the longitude falls within -180 to 180 as the Geocoding API doesn't accept values outside this range
        geocoderControl.setProximity({
          longitude: center.lng,
          latitude: center.lat
        });
      } else {
        geocoderControl.setProximity(null);
      }
    }

    // Load sign marker icon and add to map
    map.loadImage("/icons8-marker-40.png", function(error, image) {
      if (error) throw error;
      map.addImage("marker", image);
    });

    map.on("load", updateGeocoderProximity); // set proximity on map load
    map.on("moveend", updateGeocoderProximity); // and then update proximity each time the map moves

    const shouldZoomToBBox =
      this.state.signsArray.length !== 0 && this.state.initialLoad === false;

    const shouldMaintainZoomAndCenterFromUserChanges =
      this.state.initialLoad === true;

    if (shouldZoomToBBox) {
      // Handle zoom/resize to existing signs if work order has existing locations
      // Use Turf.js to create a bounding box, use bbox to set bounds for Map
      const line = lineString(this.state.signsArray);
      const mapBbox = bbox(line);
      map.fitBounds(mapBbox, { padding: 160 });
      this.setState({ initialLoad: true });
    } else if (shouldMaintainZoomAndCenterFromUserChanges) {
      // Handle case when user switches layer after moving pin
      map.jumpTo({
        center: [this.state.lng, this.state.lat],
        zoom: this.state.zoom
      });
    } else {
      // When there are no exisiting locations, zoom in on center which should be the users current location
      map.setCenter(this.state.center);
      map.resize();
      map.setZoom(17);
    }
  }

  // prepare geocoded result to be propogated to form
  passGeocodedResult({ lngLat, addressString }) {
    const location = {
      address: addressString === "default" ? null : addressString,
      position: lngLat
    };
    const locationJSON = JSON.stringify(location);

    // update the geocoder input box with the address label
    if (addressString !== "default") {
      this.onChange(locationJSON);
      geocoderControl.setInput(location.address);
    }
  }

  reverseGeocode({ lngLat }) {
    // some tech debt here fer sure
    // eslint-disable-next-line no-unused-vars
    const mapboxURL = `https://api.mapbox.com/geocoding/v5/mapbox.places/${
      lngLat.lng
    }%2C${lngLat.lat}.json?access_token=${MAPBOX_TOKEN}`;
    // eslint-disable-next-line no-unused-vars
    // const hereURL = `https://reverse.geocoder.api.here.com/6.2/reversegeocode.json?prox=${
    //   lngLat.lat
    // }%2C${
    //   lngLat.lng
    // }%2C250&mode=retrieveAddresses&maxresults=1&gen=9&app_id=${HERE_APP_ID}&app_code=${HERE_APP_CODE}`;
    if (GEOCODE_DEBUG) {
      fetch(mapboxURL).then(response => {
        const provider = "mapbox: ";
        if (response.status !== 200) {
          console.error(
            `Looks like there was a problem. Status Code: ${response.status}`
          );
          return;
        }

        response.json().then(data => {
          const mapboxAddress = data.features[0].place_name;
          console.info(provider + JSON.stringify(data));
          console.info(mapboxAddress);
        });
      });

      //   fetch(hereURL).then(response => {
      //     const provider = "HERE: ";
      //     if (response.status !== 200) {
      //       console.error(
      //         `Looks like there was a problem. Status Code: ${response.status}`
      //       );
      //       return;
      //     }

      //     response.json().then(data => {
      //       const hereAddress =
      //         data.Response.View[0].Result[0].Location.Address.Label;
      //       console.info(provider + JSON.stringify(data));
      //       console.info(hereAddress);
      //     });
      //   });
    }
    fetch(mapboxURL).then(response => {
      if (response.status !== 200) {
        console.error(
          `Looks like there was a problem. Status Code: ${response.status}`
        );
        const address = "Dropped Pin";
        this.passGeocodedResult({ lngLat, addressString: address });
        return;
      }

      response.json().then(data => {
        const mapboxAddress = data.features[0].place_name;
        const address = mapboxAddress;
        this.passGeocodedResult({ lngLat, addressString: address });
      });
    });
  }

  locationUpdated({ lngLat, addressString }) {
    // If we have an address string, skip calling the reverse geocoder
    if (addressString) {
      this.passGeocodedResult({ lngLat, addressString });
      return;
    }
    this.reverseGeocode({ lngLat });
  }

  componentDidMount() {
    const thisComponent = this;

    window.addEventListener("message", function(event) {
      if (event.origin !== "https://atd.knack.com") return;
      const data = JSON.parse(event.data);

      switch (data.message) {
        case "KNACK_LAT_LON_REQUEST":
          // send lat/lon back to Knack as comma separated string
          event.source.postMessage(
            `${thisComponent.state.lat}, ${thisComponent.state.lng}`,
            event.origin
          );
          break;
        case "SIGNS_API_REQUEST":
          const url = `https://us-api.knack.com/v1/scenes/${data.scene}/views/${
            data.view
          }/records?view-work-orders-markings-job-details_id=${data.id}`;
          axios
            .get(url, thisComponent.getHeaders(data.token, data.app_id))
            .then(response => {
              // handle success
              const data = response.data.records;
              // Populate state with existing signs in Knack work order
              const signsObjects =
                data === []
                  ? data
                  : data.map(sign => {
                      const signObj = {};
                      signObj["id"] = sign.id;
                      signObj["lat"] = sign.field_3194_raw.latitude;
                      signObj["lng"] = sign.field_3194_raw.longitude;
                      signObj["spatialId"] = sign.field_3195;
                      return signObj;
                    });
              // Populate state with array of long, lat to set bounding box required by Turf.js in onStyleLoad()
              const signsArray =
                data === []
                  ? data
                  : data.map(sign => [
                      parseFloat(sign.field_3194_raw.longitude),
                      parseFloat(sign.field_3194_raw.latitude)
                    ]);
              thisComponent.setState({
                signs: signsObjects,
                signsArray: signsArray
              });
            })
            .catch(error => {
              // handle error
              console.log("Knack API call failed");
            });
          break;
        case "KNACK_GEOLOCATION":
          console.log("KNACK_GEOLOCATION", data);
          var center = [data.lon, data.lat];
          thisComponent.setState({
            center
          });
          break;
        default:
          return;
      }
    });
  }

  render() {
    const pinDrop = this.state.showPin ? "show" : "hide";
    const {
      activeSign,
      style,
      layersLoaded,
      lat,
      lng,
      center,
      signs
    } = this.state;
    return (
      <div>
        <div className="map-container">
          {/* Boolean to force Map to render upon changing style (layers and features dissapear otherwise) */}
          {layersLoaded && (
            <Map
              // eslint-disable-next-line react/style-prop-object
              style={`mapbox://styles/mapbox/${style}`}
              onStyleLoad={this.onStyleLoad}
              onDragStart={this.onDragStart}
              onDragEnd={this.onDragEnd}
              onMoveEnd={this.onMoveEnd}
              center={center}
            >
              <div className={`pin ${pinDrop}`} />
              <div className="pulse" />

              <Layer type="symbol" id="signs" layout={layoutLayer}>
                {signs.map(sign => (
                  <Feature
                    key={sign.id}
                    coordinates={[sign.lng, sign.lat]}
                    onClick={() => this.signClick(sign.id)}
                  />
                ))}
              </Layer>
              {activeSign !== "" && (
                <Popup
                  key={activeSign.id}
                  coordinates={[activeSign.lng, activeSign.lat]}
                  onClick={this.closePopup}
                >
                  <div className="container popup">
                    <span>Spatial ID: {activeSign.spatialId}</span>
                    <br />
                    <span>ID: {activeSign.id}</span>
                    <br />
                    <span>Latitude: {activeSign.lat}</span>
                    <br />
                    <span>Longitude: {activeSign.lng}</span>
                  </div>
                </Popup>
              )}
            </Map>
          )}
          <LayerButtons toggleStyle={this.toggleStyle} />
          <form id="lat-long-display">
            <div className="form-row align-items-center mr-5">
              <div className="col-auto">
                <label htmlFor="inlineFormInput" className="font-weight-bold">
                  Latitude
                </label>
                <input
                  type="text"
                  name="lat"
                  className="form-control mb-2"
                  id="inlineFormInput"
                  placeholder="Latitude"
                  value={lat}
                  onChange={this.handleChange}
                />
              </div>
              <div className="col-auto">
                <label
                  htmlFor="inlineFormInputGroup"
                  className="font-weight-bold"
                >
                  Longitude
                </label>
                <div className="input-group mb-2">
                  <input
                    type="text"
                    name="lng"
                    className="form-control"
                    id="inlineFormInputGroup"
                    placeholder="Longitude"
                    value={lng}
                    onChange={this.handleChange}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }
}
