import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { userSettings } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** The 10 one-time detox steps (dopamine-detox onboarding, stored in user_settings.detoxWizard). */
export const DETOX_STEPS: { id: string; label: string; detail: string }[] = [
  {
    id: 'why',
    label: 'Write your why',
    detail: 'One sentence: what you will do with the reclaimed hours (values affirmation).',
  },
  {
    id: 'baseline',
    label: 'Face your baseline',
    detail: "Note yesterday's screen-time for the top distraction apps.",
  },
  {
    id: 'list',
    label: 'Declare your distractions',
    detail: 'Confirm the distraction list — these are the apps the system defends against.',
  },
  {
    id: 'remove',
    label: 'Remove triggers',
    detail: 'Log out or delete the worst offender from your phone right now.',
  },
  {
    id: 'phone_room',
    label: 'Phone protocol',
    detail: 'Decide where the phone lives during focus blocks (another room).',
  },
  {
    id: 'grayscale',
    label: 'Grayscale',
    detail: 'Switch your screen to grayscale — color is the hook.',
  },
  { id: 'notify', label: 'Notification audit', detail: 'Turn off all non-human notifications.' },
  {
    id: 'dopamine_menu',
    label: 'Build your dopamine menu',
    detail: 'Pick 3 mood-boosters from the menu for urge moments.',
  },
  {
    id: 'ifthen',
    label: 'Write one if-then plan',
    detail: '"If I feel the urge to scroll, then I will <tiny alternative>."',
  },
  {
    id: 'first_session',
    label: 'First friction-protected session',
    detail: 'Run one focus session with the friction gate on. You are in.',
  },
]

function getSettingsRow() {
  const [row] = db.select().from(userSettings).limit(1).all()
  if (row) return row
  db.insert(userSettings).values({ id: 'default' }).onConflictDoNothing().run()
  const [created] = db.select().from(userSettings).limit(1).all()
  return created
}

/** GET /api/onboarding/detox — current wizard state + step definitions. */
export async function GET() {
  const row = getSettingsRow()
  const state = row?.detoxWizard ?? {}
  return Response.json({
    steps: DETOX_STEPS,
    state,
    done: DETOX_STEPS.every((s) => state[s.id] === true),
  })
}

const detoxStepSchema = z.object({
  step: z.string('step required'),
  done: z.boolean().optional(),
})

/** POST /api/onboarding/detox { step, done? } — mark one step complete (merge into JSON state). */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, detoxStepSchema)
  const stepDef = DETOX_STEPS.find((s) => s.id === body.step)
  if (!stepDef) return Response.json({ error: `Unknown step "${body.step}"` }, { status: 400 })
  const done = body.done !== false

  const row = getSettingsRow()
  const state = { ...(row?.detoxWizard ?? {}), [body.step]: done }
  db.update(userSettings)
    .set({ detoxWizard: state, updatedAt: new Date().toISOString() })
    .where(eq(userSettings.id, row.id))
    .run()

  return Response.json({ ok: true, state, done: DETOX_STEPS.every((s) => state[s.id] === true) })
})
