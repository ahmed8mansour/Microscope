// Pure access-scope check for the success confirmation (FR-022, SC-008): the
// caller must present the exact client secret for the retrieved payment
// snapshot. This is what prevents the confirmation from being reachable by
// guessing order/intent ids — knowledge of the secret is required.
export function isAuthorizedForSnapshot(
  suppliedClientSecret: string,
  snapshotClientSecret: string
): boolean {
  return (
    suppliedClientSecret.length > 0 && suppliedClientSecret === snapshotClientSecret
  );
}
