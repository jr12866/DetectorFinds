import { Placeholder } from './Placeholder'

export function FindsScreen() {
  return (
    <Placeholder
      title="Finds"
      step="Step 03 brings this screen"
      text="Every Find you have logged, newest first, with the ones still needing detail at the top."
      coming={[
        'The 15-second field log: position, timestamp, one photo',
        'Needs Detail queue for finds enriched at home',
        'Filters, search and per-Site counts in step 08',
      ]}
    />
  )
}

export function FindDetailScreen({ id }: { id: string }) {
  return (
    <Placeholder
      title={`Find ${id}`}
      step="Step 03 brings this screen"
      text="One hole, one position, one recovery event - and the Items that came out of it."
      coming={[
        'Photos, notes, depth and position source',
        'Items with category, sub-type, tags and Date On',
        'Move pin, re-file an Item, re-assign the Find',
      ]}
    />
  )
}
