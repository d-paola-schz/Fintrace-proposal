import type { ScenarioRequest, WorkspaceResponse } from '../types/contracts'
import { Sheet } from './Sheet'
import { Chat } from './Chat'
import { Discoveries } from './Discoveries'
import { Section } from './Section'

/**
 * One way in to asking things, so the owner never has to work out that there
 * are two chat systems. This is the whole-business conversation; a node's own
 * chat lives inside its drawer and is labelled as being about that step.
 */
export function AskSheet({
  ws,
  scenario,
  onApplyScenario,
  onClose,
  initialQuestion,
}: {
  ws: WorkspaceResponse
  scenario: ScenarioRequest
  onApplyScenario: (req: ScenarioRequest) => void
  onClose: () => void
  initialQuestion?: string
}) {
  return (
    <Sheet
      title="What are you considering?"
      subtitle="Ask about your cash, or describe something you are thinking of doing."
      onClose={onClose}
    >
      <Chat
        initialQuestion={initialQuestion}
        scenario={scenario}
        placeholder="Ask anything about your cash…"
        suggestions={[
          'How am I doing?',
          'What could go wrong?',
          'Can I afford a $3,000 ad campaign this month?',
        ]}
        onApplyScenario={(r) => {
          onApplyScenario(r)
          onClose()
        }}
      />

      <Section title="What this cannot tell you" count={(ws.scenario.missingInputs ?? []).length}>
        <ul className="space-y-1.5">
          {(ws.scenario.missingInputs ?? []).map((m) => (
            <li key={m.field} className="rounded-lg border border-[#e8d296] bg-[#fdf7e4] p-2.5">
              <p className="text-[11.5px] font-semibold text-[#7f5f06]">{m.question}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[#7f5f06]/85">
                {m.whyItMatters}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Let the model suggest what to look at" tone="action">
        <Discoveries scenario={scenario} />
      </Section>
    </Sheet>
  )
}
