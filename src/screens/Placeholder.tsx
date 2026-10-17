interface PlaceholderProps {
  title: string
  step: string
  text: string
  coming: readonly string[]
}

/**
 * Every tab in the step-00 shell is a placeholder that names the step which
 * fills it in, so the navigation, install and offline behaviour can be checked
 * on a phone before any real screens exist.
 */
export function Placeholder({ title, step, text, coming }: PlaceholderProps) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <span className="step-badge">{step}</span>
      <p>{text}</p>
      <h3>What lands here</h3>
      <ul className="muted">
        {coming.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  )
}
