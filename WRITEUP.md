# Implementation Writeup

## Loom Demo Link
[Loom link](https://www.loom.com/share/4326662028e84091b9569cc85cfeac28?sid=23b06cc0-4189-40df-8fd8-b85ea34eb29e)

## Features Implemented

- Ability to select companies and select all
- Ability to move a selection of companies or move all from one list to another
- Progress bar to show transfer status to allow the user to continue actions while transfer is occurring
- Stacked progress bars in order of initiation to keep track of multiple queued transfers

## Backend Implementation

- We have a handler function that either takes the current companyIds or gets transfer_all == true and gets all companyIds from a source collection
- Starts a background task to move from one collection to another in batches and their status is tracked with in-memory storage
- Race-condition safe with use of "on_conflict_do_nothing" in case we start 2 jobs which attempt to transfer overlapping elements to a target collection
- We have a final endpoint `"/transfer-status/{job_id}"` which allows the front-end to query for jobs that are in-progress and get status updates

### Backend Assumptions
The core tradeoff I decided between was the slow inserts and saving more time, and doing more writes from the database.
The way that the backend background task is implemented is that it will only get the difference between the queued/requests companyIDs to move and the
existing associations at the beginning of the task, and will continue with that unique list to create batches and push new rows to the CompanyCollectionAssociation
table. 

The nuance here is that we could theoretically queue 2 large new transfers to the same collection at the same time. I.e. 2 requests to transfer 10k companies from `My List`
to `Liked Companies List`. Because both background tasks only generated their unique companyIds lists at the start, they will both have ~9900 overlapping unique ids.
The second task will still attempt to queue all 9k+ unique ids, and incur the 100ms cost per insert. 

A niave alternative to this model (with in-memory storage) would have been to do the unique check with each batch, and only insert the items that are unique per batch. This
would give a better sense of time varying conditions of the CompanyCollectionAssociation table for large jobs. However, I decided not to go this route because of
the number of overhead db reads this would have resulted in, even in the case where it is not useful, such as no race condition. Therefore, I chose to have a slower
task on the user end, which incurs the 100ms per redundant row, instead of having repeated unnecessary reads to the db.

## UI/UX Improvements

### Pagination Fixes
**Problem**: When changing page size, the user would lose their position in the dataset. For example, being on page 5 with 25 rows/page (offset 100) and switching to 100 rows/page would incorrectly keep them on page 5 (offset 500), jumping far ahead in the dataset.

**Solution**: Added logic in `onPaginationModelChange` to detect page size changes and recalculate the correct page number:
- When page size changes, calculate `newPage = Math.floor(offset / newMeta.pageSize)` to maintain relative position
- Set both `currentPage` and `offset` to keep the user viewing approximately the same data
- Use controlled pagination with `paginationModel={{ page: currentPage, pageSize: pageSize }}` to ensure consistent state
- Normal page navigation (without size change) continues to work as expected

This ensures users stay at their relative position in the dataset when changing how many rows are displayed per page.

### Loading State Improvements
- Adding loading symbol when fetching new rows from db
- Addresses out-of-sync loading visual bug where UI elements update but rows take a few extra seconds and then update

### Visual Enhancements
- Change "liked" field to green for easier visualization

## Future Enhancements

### Database Persistence
A more complete implementation would involve improvements to the transfer_jobs in-memory collection to a full table

- Creating a `transferBetweenCollectionEvents` table with properties:
    - userId
    - job_id: str
    - status: str  # "pending", "in_progress", "completed", "failed", "cancelled"
    - message: str
    - started_at: datetime
    - completed_at: Optional[datetime] = None
    - Source_collection: str
    - target_collection: str
    - new_company_ids_to_insert: list[int]
    - company_ids_inserted: list[int]
- This way on mount we would be able to query a user's transfer and show a persistent loading state
- It would also allow for retries on failures and generally more complex state management
- We can add features like undo to remove the new_company_ids that were inserted from the list
- We can also add a cancel feature to move the state to cancelled and undo inserts
    - We support this with the column `insertionJobId` to CompanyCollectionAssociations table
    - This means when we want to undo a job, we filter the associations table for the jobId we want to revert, and remove these associations from the table

The table also helps prevent race conditions. Lets say a user tries to queue 2 tasks, both moving 10k items from `My List` to `Liked Companies`. For the sake
of this, lets say `Liked Companies` is empty. With an events table, we can see in-progress items. With a list of all the company id's queued in the first task,
we can correctly deduplicate insertions from the second task before starting it, or handle failures (mutex or other) conditions on doing multiple moves to same collection
gracefully (i.e. queue the second move, but don't start till the first finishes)


### Advanced Selection Features
Adding support for deselecting rows after a selectAll
- Currently deselecting a row after selecting all will undo the select-all
- We can add support for instead deselecting while select-all is active to update the row model, but also to add those IDs to an "exclusion array".
- We can send this exclusion array along side selectAll flag to move all except X deselected rows
- We only remove the "deselect all" option when the rowModel selected rows length reaches 0, or the button is pressed

### Table Improvements
The table has other improvements that could be made such as:
- On collection change, if items are selected only deselect the Ids that are not in the new collection
- On page change in a collection, keep selections from previous pages