# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## 1. Assumptions

- 10,000,000 registered users.
- 10% are active each day, so there are **1,000,000 daily active users (DAU)**.
- Each active user uploads **1 photo per day** and views **50 feed pages per day**.
- An average photo is **2 MB**, and each photo also gets a **50 KB thumbnail**.
- 1 day is about 100,000 seconds (rounded for easy maths).
- Peak traffic is about 5 times the average.

## 2. Estimates

| What | Calculation | Result |
|---|---|---|
| Uploads per second (average) | 1,000,000 uploads per day ÷ 100,000 | about 10 per second |
| Uploads per second (peak) | 10 × 5 | about 50 per second |
| Feed views per second (average) | 1,000,000 users × 50 views = 50,000,000 per day ÷ 100,000 | about 500 per second |
| Feed views per second (peak) | 500 × 5 | about 2,500 per second |
| Photo storage per year | 1,000,000 × 2 MB = 2 TB per day × 365 | about 730 TB |
| Thumbnail storage per year | 1,000,000 × 50 KB = 50 GB per day × 365 | about 18 TB |
| **Total file storage per year** | 730 TB + 18 TB | **about 750 TB** |

The database only stores small records about each photo (id, owner, file location, caption, time). At roughly 500 bytes each, that is about 500 MB per day, or about 180 GB per year, which fits in one well-configured database.

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. Feed views (about 500 per second) outnumber uploads (about 10 per second) by 50 to 1. This means the design should make reads cheap: cache feeds in memory, serve photos and thumbnails from a CDN, and use read replicas so that the primary database is left to handle writes. Uploads are far fewer, but each one is heavy (2 MB), so they should not slow down feed views.

## 4. Why photos are not stored in the database

A photo is about 2 MB, while a database record is about 500 bytes, so photos would make the database thousands of times bigger. That would slow queries, backups and replication, and databases are an expensive place to keep large files. Photos belong in **object storage** (such as Amazon S3), which is cheap, extremely durable and made for large files. The database keeps only the small record and the file's location (for example `photos/123/original.jpg`), and the CDN serves the files to users.

## 5. Architecture diagram

```
                        +------------+
   Users  ------------> |    DNS     |   snapshare.com -> IP address
 (web / mobile)         +------------+
      |
      | (a) static files, photos, thumbnails
      +----------------------------> +-------------------+  cache miss  +-----------------+
      |                              |  CDN edge servers | -----------> | Object storage  |
      |                              +-------------------+              | (photo files)   |
      |                                                                 +--------^--------+
      | (b) API calls: feed, upload                                              |
      v                                                                          | originals and
+-------------------+                                                            | thumbnails
|  Load balancer    |                                                            |
+---------+---------+                                                            |
          |                                                                      |
   +------+----------+------------------+                                        |
   v                 v                  v                                        |
+-------+        +-------+          +-------+                                    |
| App 1 |        | App 2 |          | App 3 |  (stateless, identical) -----------+
+---+---+        +---+---+          +---+---+     save original file
    |                |                  |
    +----------------+------------------+
          |                 |                 |
          v                 v                 v
+-----------------+  +--------------+   +-----------+     +----------------------+
| Cache (Redis)   |  | Primary DB   |   |  Queue    |---->| Thumbnail worker(s)  |
| feed lists      |  | (writes)     |   | (jobs)    |     +----------------------+
+-----------------+  +------+-------+   +-----------+        | saves thumbnail to
                            | copies                         | object storage and
                            v                                | marks photo "ready" in DB
                     +--------------+
                     | Read replica |  <--- feed reads on a cache miss
                     +--------------+
```

## 6. What each component does

- **DNS:** turns the name snapshare.com into the IP address of the servers, so users do not need to know it.
- **CDN:** keeps copies of photos, thumbnails and the web files on servers near users, which cuts latency and takes load off our servers.
- **Load balancer:** spreads requests across the app servers and skips any server that fails its health check, so no single server is overloaded.
- **App servers (several):** run the API code, and because they are stateless any of them can handle any request, so we can add more as traffic grows.
- **Cache (Redis):** keeps popular feed lists in memory so most feed views never touch the database, which solves the 500-views-per-second read load.
- **Primary database:** stores the one true copy of the photo records, users and follows, and accepts all writes.
- **Read replica:** holds a copy of the primary and answers read queries, which protects the primary from the heavy read traffic.
- **Object storage:** stores the large photo and thumbnail files cheaply and durably, so the database stays small.
- **Queue and thumbnail worker:** make thumbnails in the background, so an upload can reply to the user at once instead of waiting for the image to be resized.

## 7. Upload flow (step by step)

1. The user picks a photo and the app sends `POST /photos` with the file and the login token.
2. DNS has already given the address, so the request reaches the **load balancer**, which passes it to a healthy **app server**.
3. The app server checks the token, then validates the file (it must be an image and under the size limit).
4. The app server saves the **original photo** in **object storage**.
5. It writes a small record to the **primary database**, with the owner, the file location and the status `processing`.
6. It puts a job, "make thumbnail for photo 123", on the **queue**.
7. It deletes the uploader's cached feed entry in Redis so stale data is not served, and replies **201 Created** straight away.
8. A **worker** takes the job from the queue, downloads the original, creates the 50 KB thumbnail and saves it in object storage.
9. The worker updates the photo's record to `ready`. The primary copies the change to the read replica a few milliseconds later.
10. Followers' feeds then show the photo, loaded from the **CDN**.

## 8. Trade-offs

1. **Speed versus freshness.** Cached feeds and read replicas make feed views fast, but they can be a few seconds out of date, so a new photo may not appear in a follower's feed immediately. This is acceptable for a photo app, where a few seconds' delay does not matter (it would not be for a bank balance).
2. **Fast upload versus instant thumbnail.** Making thumbnails in the background keeps uploads quick, but the thumbnail is not ready for a moment, so the app must show a placeholder until the status becomes `ready`.
3. **Simplicity versus scalability.** One server would be easier to build and understand, but it is a single point of failure and cannot handle 2,500 views per second at peak. Several servers, a cache and a queue are harder to run, but they allow growth.
4. **Cost versus reliability.** Extra app servers, a replica and copies of the files cost more money, but they mean a failure of one part does not take the whole app down.