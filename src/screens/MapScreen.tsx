import { Placeholder } from './Placeholder'

export function MapScreen() {
  return (
    <Placeholder
      title="Map"
      step="Step 02 brings this screen"
      text="The map, the blue dot, and dropping a pin where you are standing."
      coming={[
        'Leaflet with USGS imagery, topo and hybrid basemaps',
        'Your live position with an accuracy circle',
        'Drop pin at my position, and drop pin where I tap',
        'Tap a pin to open the Find it belongs to',
      ]}
    />
  )
}
