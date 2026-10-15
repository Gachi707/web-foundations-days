# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. Most days it is quiet, but when a popular concert goes on sale, huge numbers of people arrive at once and compete for a limited number of seats. The hardest parts of the design are surviving that spike, treating buyers fairly, and never selling the same seat twice.

**Facts used:** 2 million registered users. On a normal day, 50,000 people visit (10 pages each) and 5,000 tickets are sold. When a popular concert goes on sale, 200,000 people try to buy its 20,000 seats within the first 10 minutes.

## 1. Requirements

### Functional requirements
- Users can register and log in.
- Users can browse events and see the details of one event.
- Users can see which seats are available for an event.
- Users can **hold** one or more seats for a short time while they pay.
- Users can pay for held seats and receive tickets.
- Users can view their own tickets.
- Users receive a confirmation email.

### Non-functional requirements
- **Correctness:** a seat must never be sold to two people. This is the most important rule.
- **Fairness:** during a big sale, people are served in the order they arrived, and bots or rapid refreshing do not give an advantage.
- **Speed:** the seat map loads in under 500 ms for 95% of requests, even during a big sale.
- **Availability:** 99.9% overall, and the system must stay up during a sale (a crash on sale day would be a disaster for the business).
- **Durability:** a paid order is never lost.
- **Security:** HTTPS, hashed passwords, and card details handled only by a payment provider and never stored by us.
- **Fault tolerance:** if payment fails or the user abandons checkout, the seat returns to sale automatically.

## 2. Estimates

### Normal day
| What | Calculation | Result |
|---|---|---|
| Page views | 50,000 visitors × 10 pages = 500,000 per day ÷ 100,000 | **5 per second** (about 25 at peak) |
| Ticket sales | 5,000 per day ÷ 100,000 | **0.05 per second** (about 0.25 at peak) |
| Storage | about 1.8 million orders per year × about 200 bytes | well under 1 GB per year |

A normal day is very small, and one server could handle it.

### Big sale (popular concert)
| What | Calculation | Result |
|---|---|---|
| Users arriving | 200,000 ÷ 600 seconds (10 minutes) | **about 333 per second** |
| Total requests | 200,000 users × 10 requests each = 2,000,000 ÷ 600 | **about 3,300 per second** |
| Hold attempts | 200,000 ÷ 600 | **about 333 per second** |
| Most that can be sold | 20,000 seats ÷ 600 | about 33 per second |

### Comparison
The big sale is about **130 times** the normal peak request rate, and its hold attempts are over **1,000 times** the normal peak sales rate. It also lasts only about 10 minutes, so it is a short, sharp spike and not steady growth. Only 10% of buyers (20,000 of 200,000) can succeed, so 180,000 people must be turned away politely and fairly. This tells us the design must absorb a spike (a waiting room, a cache and extra servers), not just run steadily.

## 3. API

All requests use JSON and HTTPS, and all except `POST /sessions` and the two browse endpoints need the header `Authorization: Bearer <token>`.

| # | Method | Path | Description | Success |
|---|---|---|---|---|
| 1 | POST | `/sessions` | Log in and receive a token | 201 Created |
| 2 | GET | `/events` | List events (supports `?page=`) | 200 OK |
| 3 | GET | `/events/{id}` | Details of one event | 200 OK |
| 4 | GET | `/events/{id}/seats` | Seat map with each seat's status | 200 OK |
| 5 | POST | `/events/{id}/holds` | Hold seats for 10 minutes | 201 Created |
| 6 | DELETE | `/events/{id}/holds` | Release seats the user is holding | 204 No Content |
| 7 | POST | `/orders` | Pay for held seats and create the order and tickets | 201 Created |
| 8 | GET | `/tickets` | List the logged-in user's tickets | 200 OK |

### Example: hold seats, `POST /events/7/holds`

Request body:

```json
{ "seatIds": [101, 102] }
```

Response `201 Created`:

```json
{ "seatIds": [101, 102], "holdExpiresAt": "2026-10-20T10:12:00Z" }
```

If one of the seats is already taken, nothing is held and the response is `409 Conflict`:

```json
{ "error": { "status": 409, "code": "SEAT_TAKEN", "message": "Seat 102 is no longer available." } }
```

### Example: pay, `POST /orders`

```json
{ "eventId": 7, "seatIds": [101, 102], "paymentToken": "tok_abc123", "idempotencyKey": "order-7f3a" }
```

Response `201 Created`: `{ "orderId": 5521, "tickets": [{ "seatId": 101, "code": "TH-8K2D" }, { "seatId": 102, "code": "TH-8K2E" }] }`

### Error codes
- **400:** invalid request, for example more than 4 seats.
- **401:** not logged in.
- **402 Payment Required:** the payment was declined.
- **404:** the event or seat does not exist.
- **409 Conflict:** the seat is already held or sold.
- **410 Gone:** the hold has expired.
- **429:** too many requests (rate limit).

## 4. Data model

Five tables: `users`, `events`, `seats`, `orders` and `tickets`.

**Relationships**
- **users to orders:** one-to-many. A user can place many orders, and each order belongs to one user.
- **events to seats:** one-to-many. An event has thousands of seats, and each seat belongs to one event.
- **events to orders:** one-to-many.
- **orders to tickets:** one-to-many. One order can contain several tickets.
- **seats to tickets:** one-to-one at most. A seat can have **at most one ticket**, which is enforced by a unique constraint.
- **users to seats (holds):** a seat can be temporarily held by one user, using `held_by` and `hold_expires_at`.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  venue      TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  on_sale_at TEXT NOT NULL
);

CREATE TABLE seats (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL,
  section         TEXT NOT NULL,
  row_label       TEXT NOT NULL,
  seat_number     INTEGER NOT NULL,
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'held', 'sold')),
  held_by         INTEGER,
  hold_expires_at TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by)  REFERENCES users(id),
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  event_id    INTEGER NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status      TEXT NOT NULL DEFAULT 'paid'
              CHECK (status IN ('paid', 'failed', 'refunded')),
  payment_ref TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE tickets (
  id       INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  seat_id  INTEGER NOT NULL UNIQUE,   -- one ticket per seat, ever
  code     TEXT NOT NULL UNIQUE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id);
```

The index on `seats (event_id, status)` makes "show the available seats for this event" fast, which is the most common query during a sale.

## 5. How the design prevents two people buying the same seat

The danger is a **race condition**: two buyers both see seat 101 as available at the same moment and both try to take it. The design stops this with three layers.

**Layer 1: an atomic hold.** The check and the change happen in one statement, so the database decides who is first:

```sql
UPDATE seats
SET status = 'held', held_by = :user_id,
    hold_expires_at = datetime('now', '+10 minutes')
WHERE id = :seat_id
  AND event_id = :event_id
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));
```

The database locks the row while it runs, so when two buyers go for the same seat, one statement runs first and changes 1 row, and the second finds that the seat is no longer available and changes **0 rows**. The app returns `409 Conflict` to the second buyer. It is important that the check is inside the `WHERE` clause, because "read the status, then update it" as two separate steps would let both buyers pass the check.

**Layer 2: a transaction at payment.** Paying runs as one all-or-nothing transaction:

1. `BEGIN`.
2. Confirm that the seats are still held by this user and that the hold has not expired.
3. Insert the order, insert a ticket for each seat, and set the seats to `sold`.
4. `COMMIT`. If anything fails (for example the payment is declined), `ROLLBACK`, and nothing is half-saved.

The payment is sent with an **idempotency key**, so a retry or double-click cannot charge the card twice.

**Layer 3: a database constraint as the last defence.** `tickets.seat_id` is `UNIQUE`. Even if there were a bug in the code, the database would refuse to create a second ticket for the same seat, so a double sale is impossible.

**Holds expire.** A hold lasts 10 minutes. After that the seat is available again, because the hold query above can take over an expired hold, and a background worker also clears expired holds regularly, so abandoned checkouts never block seats forever.

## 6. Architecture and how it survives the big sale

### What each component does
- **Client (web or mobile):** shows events and seats and sends API requests.
- **DNS:** turns tickethub.com into the IP addresses of our servers.
- **CDN:** serves the pages, images and scripts from servers near users, so the spike of 200,000 people does not hit our own servers for static files.
- **Waiting room (virtual queue):** during a big sale, users get a place in line and are let in in small batches. This protects the system, and it is the main way we get fairness, because people enter in order of arrival.
- **Load balancer:** spreads requests over the app servers and skips any that fail a health check.
- **App servers (several, scaled up before a sale):** run the API code and are stateless, so we can add more before the sale begins.
- **Cache (Redis):** keeps event details and the seat map for a second or two, and counts requests for rate limiting, so most of the 3,300 requests per second never reach the database.
- **Primary database:** the single source of truth. All seat holds and orders happen here, so the "who got the seat" decision is made in one place.
- **Read replicas:** answer read-only queries such as event lists and "my tickets", so the primary is free for the critical writes.
- **Queue and workers:** send emails, make ticket PDFs, process payment confirmations and release expired holds in the background, so the buyer's request is not kept waiting.
- **Payment provider (external):** handles card details, so we never store them.

### How it survives the sale
- The **CDN** and the **cache** absorb most of the 3,300 requests per second, because most of them are people looking at the same event page and seat map.
- The **waiting room** lets only a limited number of people (for example 2,000) into the buying flow at once, so the app servers and database see a steady, manageable load instead of 200,000 people at the same instant.
- Only about 333 hold attempts per second reach the primary database. Each is one indexed single-row update, which one primary can easily handle (and the cap of 33 completed sales per second is tiny).
- **Servers are scaled up before the sale** starts (we know the time from `on_sale_at`), instead of waiting for load to arrive.
- **Rate limiting** (HTTP 429) stops bots and repeated refreshing from taking more than their share.
- If a server dies, the load balancer routes around it. If the cache fails, the app reads from the database, which is slower but still correct.

## 7. Trade-offs

1. **Fairness and protection versus user experience.** The waiting room makes people wait, and some will find it annoying, but without it the site would crash and nobody could buy anything. A short wait in an orderly line is better than a failed site.
2. **Speed versus freshness.** The seat map is cached for one or two seconds, so a user may see a seat as available when it has just been taken. We accept this, because the real check is the atomic hold, and the user then gets a clear "409 seat taken" message and the map refreshes. Keeping the map perfectly live would put 3,300 reads per second on the database.
3. **Correctness versus availability.** Seat holds and payments always go to the single primary database, so if it is down, nobody can buy until a replica takes over. We choose this because selling the same seat twice is worse than a short outage, whereas browsing events can continue from replicas and the cache.
4. **Cost versus readiness.** Scaling up servers just for a ten-minute sale costs money, but a failed big sale would cost far more in lost sales and reputation. We scale up only around sale times and scale back down afterwards.

## 8. Architecture diagram

```
                      +-----------+
   +----------------->|    DNS    |  tickethub.com -> IP addresses
   |                  +-----------+
+--+-----------+   pages, images, scripts    +----------------+
| Client       |---------------------------->|  CDN edge      |
| (web/mobile) |                             |  servers       |
+--+-----------+                             +----------------+
   |
   | API calls (HTTPS, JSON)
   v
+------------------+
| Waiting room     |  during big sales: lets users in in batches, in order
+--------+---------+
         v
+------------------+
| Load balancer    |  health checks, rate limiting
+--------+---------+
         |
   +-----+-----------+-----------+
   v                 v           v
+--------+       +--------+  +--------+
| App 1  |       | App 2  |  | App N  |   stateless, scaled up before a sale
+---+----+       +---+----+  +----+---+
    |                |            |
    +--------+-------+------------+
             |
   +---------+----------+----------------------+
   v                    v                      v
+----------------+  +----------------+   +---------+     +----------+
| Cache (Redis)  |  | Primary DB     |   | Queue   |---->| Workers  |
| seat map, 1-2s |  | holds + orders |   | (jobs)  |     | email,   |
| rate limits    |  | (all writes)   |   +---------+     | PDFs,    |
+----------------+  +-------+--------+                   | expiry   |
                            | copies                     +----+-----+
                            v                                 |
                     +--------------+                         v
                     | Read replica |  events, "my tickets"  +------------------+
                     +--------------+                        | Payment provider |
                                                             +------------------+
```

The CDN serves static files, the waiting room controls who enters, writes go to the primary, reads go to the cache or replicas, and slow jobs go to the queue.