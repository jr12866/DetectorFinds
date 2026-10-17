import { Placeholder } from './Placeholder'

export function SessionsScreen() {
  return (
    <Placeholder
      title="Sessions"
      step="Step 05 brings this screen"
      text="One day out detecting: the Site you worked, the detector you used, and the Track you walked."
      coming={[
        'Start and stop a Session from a sheet with Site and Detector pickers',
        'Track recorded every 3 seconds or 5 metres, paused visibly when backgrounded',
        'Detector list and free-text settings presets',
      ]}
    />
  )
}

export function SessionDetailScreen({ id }: { id: string }) {
  return (
    <Placeholder
      title={`Session ${id}`}
      step="Step 05 brings this screen"
      text="Recorded distance and recorded time for one day out."
      coming={['Track drawn on the map', 'GPX export', 'The Finds logged that day']}
    />
  )
}
