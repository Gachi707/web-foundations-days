# SnapShare Scaling Plan

SnapShare is a photo-sharing app: users upload photos and scroll a feed of photos from people they follow. (A longer version is in `photo-app-scaling-full.md`.)

## 1. Assumptions and estimates

10,000,000 registered users; 10% are active each day = **1,000,000 daily active users**. Each uploads 1 photo and views 50 feed pages per day. A photo is 2 MB and its thumbnail 50 KB. 1 day is about 100,000 seconds; peak traffic is 5 times the average.

| What | Calculation | Result |
|---|---|---|
| Uploads per second | 1,000,000 ÷ 100,000 | **10/s** (50/s at peak) |
| Feed views per second | 1,000,000 × 50 = 50,000,000 ÷ 100,000 | **500/s** (2,500/s at peak) |
| Photo storage | 1,000,000 × 2 MB = 2 TB per day × 365 | **730 TB per year** |
| Thumbnail storage | 1,000,000 × 50 KB = 50 GB per day × 365 | **18 TB per year** |
| Total files | 730 + 18 | **about 750 TB per year** |

Database records are small (about 500 bytes per photo, roughly 180 GB per year).

## 2. Read-heavy or write-heavy?

**Read-heavy:** 500 feed views per second against 10 uploads per second is 50 to 1. So we cache feeds in memory, serve files from a CDN, and use read replicas. Uploads are rare but heavy (2 MB), so they must not slow down feed views.

## 3. Why photos are not stored in the database

A photo is 2 MB and a database record is about 500 bytes, so photos would make the database thousands of times bigger and slow down queries, backups and replication. **Object storage** (such as S3) is cheap, durable and built for large files. The database keeps only the file's location, and the CDN serves the files.

## 4. Upload flow, step by step

1. The app sends `POST /photos` with the file and the login token.
2. The **load balancer** passes it to a healthy **app server**.
3. The app server checks the token and the file (image type, size limit).
4. It saves the **original photo in object storage**.
5. It writes a record to the **primary database** (owner, file location, status `processing`).
6. It pushes a job, "make thumbnail for photo 123", onto the **queue**.
7. It deletes the uploader's cached feed entry and **replies `201 Created` immediately**.
8. A **worker** takes the job, makes the 50 KB thumbnail and saves it in object storage.
9. The worker sets the record to `ready`; the primary copies the change to the **read replica**.
10. Followers' feeds now show the photo, with files served through the **CDN**.

**If the worker fails:** the job is retried up to 3 times with increasing waits (back-off). If it still fails, it moves to a **dead-letter queue** for investigation, the record is marked `failed`, and the photo keeps its placeholder thumbnail so the upload itself is never lost.

## 5. Trade-offs

1. **Eventual consistency versus immediate cache invalidation.** Feeds come from the cache and read replicas, which are fast but can be a few seconds behind (replication lag and cache expiry). Deleting the uploader's cache entry on upload lets them see their photo at once, while followers catch up within seconds. That is fine for photos, but not for something like a bank balance.
2. **Fast upload versus instant thumbnail.** Making thumbnails in the background keeps uploads quick, but the thumbnail appears a moment later, so the app shows a placeholder until the status is `ready`.
3. **Simplicity versus scalability.** One server is easier to run, but it is a single point of failure and cannot handle 2,500 views per second at peak, so we use several servers, a cache and a queue.
4. **Cost versus reliability.** Extra servers, a replica and file copies cost more, but one failure does not stop the app.

## 6. Components

- **DNS:** solves the problem of users not knowing server addresses, by turning snapshare.com into IP addresses.
- **CDN:** serves photos, thumbnails and static files from servers near users, cutting latency and load.
- **Load balancer:** spreads requests over the app servers and skips any that fail a health check.
- **App servers:** run the API and are stateless, so we can add more as traffic grows.
- **Cache (Redis):** keeps popular feeds in memory, so most of the 500 views per second never reach the database.
- **Primary database:** gives one trusted copy of the photo records, users and follows, so there are no conflicting versions of the data.
- **Read replica:** a copy that answers read queries, protecting the primary.
- **Object storage:** holds the large photo and thumbnail files cheaply and durably.
- **Queue and worker:** make thumbnails in the background, so uploads reply quickly.

## 7. Architecture diagram

```
Users --> DNS
  |-----> CDN --(cache miss)--> [Object storage]
  v
[Load balancer]
  |
[App 1] [App 2] [App 3]   (stateless)
  |       |       |
  +-------+-------+--------+-----------------+
  v                v        v                 v
[Redis cache]  [Primary DB] [Object storage] [Queue] --> [Thumbnail worker]
                   |                                      (saves thumbnail,
                   v                                       marks photo ready)
             [Read replica] <-- feed reads on a cache miss
```