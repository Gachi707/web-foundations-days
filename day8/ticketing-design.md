# TicketHub Design Document

TicketHub sells tickets for concerts. The hard parts are surviving a huge sale spike, treating buyers fairly, and never selling a seat twice. (A longer version is in `ticketing-design-full.md`.)

## 1. Requirements

**Functional:** register and log in; browse events; view the seat map; hold seats for 10 minutes; pay; view my tickets.

**Non-functional:** **correctness** (a seat is never sold twice); **fairness** (first come, first served, no advantage for bots); **speed** (seat map under 500 ms for 95% of requests); **availability** 99.9%, especially on sale day; **durability** (a paid order is never lost); **security** (HTTPS, hashed passwords, card data handled only by the payment provider).

## 2. Estimates (1 day = 100,000 seconds)

| | Normal day | Big sale (10 minutes = 600 s) |
|---|---|---|
| Requests | 50,000 visitors × 10 pages = 500,000 ÷ 100,000 = **5/s** (25/s peak) | 200,000 users × 10 requests = 2,000,000 ÷ 600 = **about 3,300/s** |
| Purchases | 5,000 per day = **0.05/s** (0.25/s peak) | 200,000 hold attempts ÷ 600 = **about 333/s**; at most 20,000 sales = 33/s |

**Comparison:** the sale is about **130 times** the normal peak, lasts only 10 minutes, and 90% of buyers (180,000 people) must be turned away fairly. The design must absorb a spike, not just run steadily.

## 3. API

| Method | Path | Purpose | Success |
|---|---|---|---|
| GET | `/events` | List events | 200 |
| GET | `/events/{id}/seats` | Seat map with each seat's status | 200 |
| POST | `/events/{id}/holds` | Hold seats, body `{"seatIds":[101,102]}` | 201 |
| DELETE | `/events/{id}/holds` | Release my held seats | 204 |
| POST | `/orders` | Pay, body `{"seatIds":[101,102],"paymentToken":"tok_1","idempotencyKey":"k1"}` | 201 |
| GET | `/tickets` | My tickets | 200 |

**Errors:** 401 not logged in, 402 payment declined, 409 seat already taken, 410 hold expired, 429 too many requests.

## 4. Data model

```
users(id PK, name, email UNIQUE, password_hash)
events(id PK, title, venue, starts_at, on_sale_at)
seats(id PK, event_id FK, section, row_label, seat_number, price_cents,
      status 'available'|'held'|'sold', held_by FK users, hold_expires_at)
orders(id PK, user_id FK, event_id FK, total_cents, status, payment_ref UNIQUE)
tickets(id PK, order_id FK, seat_id FK UNIQUE, code UNIQUE)
```

**Relationships:** one user has many orders; one event has many seats; one order has many tickets; a seat has at most one ticket (`seat_id` is UNIQUE).

## 5. Preventing double-booking

1. **Atomic hold.** One statement checks and changes the seat, so the database decides who is first:

```sql
UPDATE seats SET status='held', held_by=:user,
  hold_expires_at=datetime('now','+10 minutes')
WHERE id=:seat AND (status='available'
  OR (status='held' AND hold_expires_at < datetime('now')));
```

   1 row changed means you got the seat; 0 rows means it is taken, so the API returns **409**. Because the check is inside the `WHERE`, two buyers cannot both pass it.
2. **Transaction at payment.** BEGIN; confirm the hold is mine and not expired; insert the order and tickets; set the seats to `sold`; COMMIT. Any failure means ROLLBACK. An idempotency key stops a double charge.
3. **Constraint.** `tickets.seat_id` is UNIQUE, so even a code bug cannot create a second ticket for a seat. A worker frees expired holds.

## 6. Architecture

- **DNS:** turns tickethub.com into server addresses. **CDN:** serves pages and images near users. **Waiting room:** admits buyers in order, in batches (fairness, and it protects the backend).
- **Load balancer and stateless app servers:** spread load; scaled up before the sale starts.
- **Redis cache:** keeps the seat map for 1 to 2 seconds and counts requests for rate limiting.
- **Primary database:** all holds and orders, the single source of truth. **Read replicas:** events and "my tickets".
- **Queue and workers:** emails, ticket PDFs, releasing expired holds. **Payment provider:** handles cards.

**Surviving the sale:** the CDN and cache absorb most of the 3,300 requests per second, the waiting room limits how many buyers are inside at once, and only about 333 hold attempts per second (single-row updates) reach the primary.

## 7. Trade-offs

1. **Fairness versus convenience:** the waiting room makes people wait, but without it the site would crash for everyone.
2. **Speed versus freshness:** the cached seat map can show a seat that was just taken, but the atomic hold is the real check, so the user gets a 409 and the map refreshes.

## 8. Diagram

```
Client --> DNS
   |-----> CDN (static files)
   v
[Waiting room] --> [Load balancer] --> [App 1] [App 2] [App N]
                                            |      |      |
   +------------------+---------------------+------+------+
   v                  v                     v             v
[Redis cache]   [Primary DB]            [Queue]     [Payment provider]
                    |                       v
                    v                  [Workers]
              [Read replica]
```