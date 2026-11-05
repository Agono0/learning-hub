/** GET /api/curriculum/courses — the course catalog with progress and "continue" links. */
import { listCourses } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async () => Response.json({ courses: listCourses() }))
