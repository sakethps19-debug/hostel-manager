// A single serverless function call processes a broadcast sequentially, so
// this keeps one invocation within a reasonable execution budget. Larger
// sends need to be split into multiple broadcasts for now. Kept in its own
// module (not app/actions/communications.ts) because a "use server" file
// may only export async functions - a plain constant export breaks it.
export const MAX_BROADCAST_RECIPIENTS = 200;
