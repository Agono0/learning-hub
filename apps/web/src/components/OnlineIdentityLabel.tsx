/**
 * Shows a participant or chat sender name with an explicit "guest" tag unless the server
 * verified them with a registered device key. A guest can type any name, so the tag is what
 * keeps a guest from looking like the registered person they copied the name from.
 */
export function OnlineIdentityLabel({
  alias,
  verified,
  className = 'font-medium',
}: {
  alias: string
  verified?: boolean
  className?: string
}) {
  return (
    <>
      <span className={className}>{alias}</span>
      {verified !== true && (
        <span
          className="text-tertiary"
          data-testid="guest-tag"
          title="Not verified: anyone can pick this name"
        >
          (guest)
        </span>
      )}
    </>
  )
}
