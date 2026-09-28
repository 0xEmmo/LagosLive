export function isAccountTicketOwner({
  requestedOrderId,
  userId,
  order,
}: {
  requestedOrderId: string;
  userId: string | null;
  order: { id: string; user_id: string | null };
}): boolean {
  return Boolean(userId && order.id === requestedOrderId && order.user_id === userId);
}
