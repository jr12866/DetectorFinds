import { Placeholder } from './Placeholder'

export function SitesScreen() {
  return (
    <Placeholder
      title="Sites"
      step="Step 06 brings this screen"
      text="Where you detect: the ground, the landowner, the permission you hold, and the boundary you walked."
      coming={[
        'Site with Ground Kind, Access Notes and PLSS township, range and section',
        'Drawn Site Boundary, by tapping or by walking it',
        'Permission as its own record, with a history per Site',
      ]}
    />
  )
}

export function SiteDetailScreen({ id }: { id: string }) {
  return (
    <Placeholder
      title={`Site ${id}`}
      step="Step 06 brings this screen"
      text="One place you are allowed to detect, and everything found there."
      coming={['Boundary and Cached Area', 'Permission history', 'Finds near this Site with no Site yet']}
    />
  )
}
