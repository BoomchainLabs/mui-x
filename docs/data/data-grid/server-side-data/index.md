# Data Grid - Server-side data

<p class="description">The Data Grid server-side data.</p>

## Introduction

Server-side data management in React can become complex with growing datasets.
Challenges include manual data fetching, pagination, sorting, filtering, and performance optimization.
A dedicated module can help abstract these complexities, improving user experience.

Consider a Data Grid displaying a list of users.
It supports pagination, sorting by column headers, and filtering.
The Data Grid fetches data from the server when the user changes the page or updates filtering or sorting.

```tsx
const [rows, setRows] = React.useState([]);
const [paginationModel, setPaginationModel] = React.useState({
  page: 0,
  pageSize: 10,
});
const [filterModel, setFilterModel] = React.useState({ items: [] });
const [sortModel, setSortModel] = React.useState([]);

React.useEffect(() => {
  const fetcher = async () => {
    // fetch data from server
    const data = await fetch('https://my-api.com/data', {
      method: 'GET',
      body: JSON.stringify({
        page: paginationModel.page,
        pageSize: paginationModel.pageSize,
        sortModel,
        filterModel,
      }),
    });
    setRows(data.rows);
  };
  fetcher();
}, [paginationModel, sortModel, filterModel]);

<DataGrid
  columns={columns}
  pagination
  sortingMode="server"
  filterMode="server"
  paginationMode="server"
  onPaginationModelChange={setPaginationModel}
  onSortModelChange={setSortModel}
  onFilterModelChange={setFilterModel}
/>;
```

This example only scratches the surface with a lot of problems still unsolved like:

- Performance optimization
- Caching data/deduping requests
- More complex use cases on the server like grouping, tree data, etc.
- Server-side row editing
- Lazy loading of data
- Handling updates to the data like row editing, row deletion, etc.
- Refetching data on-demand

Trying to solve these problems one after the other can make the code complex and hard to maintain.

## Data source

The idea for a centralized data source is to simplify server-side data fetching.
It's an abstraction layer between the Data Grid and the server, providing a simple interface for interacting with the server.
Think of it like an intermediary handling the communication between the Data Grid (client) and the actual data source (server).

It has an initial set of required methods that you need to implement. The Data Grid will use these methods internally to fetch a subset of data when needed.

Let's take a look at the minimal `GridDataSource` interface configuration.

```tsx
interface GridDataSource {
  /**
   * This method will be called when the grid needs to fetch some rows.
   * @param {GridGetRowsParams} params The parameters required to fetch the rows.
   * @returns {Promise<GridGetRowsResponse>} A promise that resolves to the data of
   * type [GridGetRowsResponse].
   */
  getRows(params: GridGetRowsParams): Promise<GridGetRowsResponse>;
}
```

:::info

The above interface is a minimal configuration required for a data source to work.
More specific properties like `getChildrenCount()` and `getGroupKey()` will be discussed in the corresponding sections.

:::

Here's how the above mentioned example would look like when implemented with the data source:

```tsx
const customDataSource: GridDataSource = {
  getRows: async (params: GridGetRowsParams): GetRowsResponse => {
    const response = await fetch('https://my-api.com/data', {
      method: 'GET',
      body: JSON.stringify(params),
    });
    const data = await response.json();

    return {
      rows: data.rows,
      rowCount: data.totalCount,
    };
  },
}

<DataGrid
  columns={columns}
  dataSource={customDataSource}
  pagination
/>
```

The code has been significantly reduced, the need for managing the controlled states is removed, and data fetching logic is centralized.

## Server-side filtering, sorting, and pagination

The data source changes how the existing server-side features like `filtering`, `sorting`, and `pagination` work.

### Without data source

Without data source, the features `filtering`, `sorting`, `pagination` work on `client` by default.
In order for them to work with server-side data, you need to set them to `server` explicitly and provide the [`onFilterModelChange()`](/x/react-data-grid/filtering/server-side/), [`onSortModelChange()`](/x/react-data-grid/sorting/#server-side-sorting), [`onPaginationModelChange()`](/x/react-data-grid/pagination/#server-side-pagination) event handlers to fetch the data from the server based on the updated variables.

```tsx
<DataGrid
  columns={columns}
  rows={rows}
  pagination
  sortingMode="server"
  filterMode="server"
  paginationMode="server"
  onPaginationModelChange={(newPaginationModel) => {
    // fetch data from server
  }}
  onSortModelChange={(newSortModel) => {
    // fetch data from server
  }}
  onFilterModelChange={(newFilterModel) => {
    // fetch data from server
  }}
/>
```

### With data source

With the data source, the features `filtering`, `sorting`, `pagination` are automatically set to `server`.

When the corresponding models update, the Data Grid calls the `getRows()` method with the updated values of type `GridGetRowsParams` to get updated data.

```tsx
<DataGrid
  columns={columns}
  // automatically sets `sortingMode="server"`, `filterMode="server"`, `paginationMode="server"`
  dataSource={customDataSource}
/>
```

The following demo showcases this behavior.

{{"demo": "ServerSideDataGrid.js", "bg": "inline"}}

:::info
The data source demos use a `useMockServer()` utility function to simulate server-side data fetching.
In a real-world scenario you would replace this with your own server-side data-fetching logic.

Open the Info section of your browser console to see the requests being made and the data being fetched in response.
:::

## Data caching

The data source caches fetched data by default.
This means that if the user navigates to a page or expands a node that has already been fetched, the grid will not call the `getRows()` function again to avoid unnecessary calls to the server.

The `GridDataSourceCacheDefault` is used by default which is a simple in-memory cache that stores the data in a plain object. It can be seen in action in the [demo above](#with-data-source).

### Improving the cache hit rate

To increase the cache hit rate, Data Grid splits `getRows()` results into chunks before storing them in cache.
For the requests that follow, chunks are combined as needed to recreate the response.
This means that a single request can make multiple calls to the `get()` or `set()` method of `GridDataSourceCache`.

Chunk size is the lowest expected amount of records per request based on the `pageSize` value from the `paginationModel` and `pageSizeOptions` props.

Because of this, values in the `pageSizeOptions` prop play a big role in the cache hit rate.
We recommend using values that are multiples of the lowest value; even better if each subsequent value is a multiple of the previous value.

Here are some examples:

1. Best scenario - `pageSizeOptions={[5, 10, 50, 100]}`

   In this case the chunk size is 5, which means that with `pageSize={100}` there are 20 cache records stored.

   Retrieving data for any other `pageSize` up to the first 100 records results in a cache hit, since the whole dataset can be made of the existing chunks.

2. Parts of the data missing - `pageSizeOptions={[10, 20, 50]}`

   Loading the first page with `pageSize={50}` results in 5 cache records.
   This works well with `pageSize={10}`, but not as well with `pageSize={20}`.
   Loading the third page with `pageSize={20}` results in a new request being made, even though half of the data is already in the cache.

3. Incompatible page sizes - `pageSizeOptions={[7, 15, 40]}`

   In this situation, the chunk size is 7.
   Retrieving the first page with `pageSize={15}` creates chunks split into `[7, 7, 1]` records.
   Loading the second page creates 3 new chunks (again `[7, 7, 1]`), but now the third chunk from the first request has an overlap of 1 record with the first chunk of the second request.
   These chunks with 1 record can only be used as the last piece of a request for `pageSize={15}` and are useless in all other cases.

:::info
In the examples above, `sortModel` and `filterModel` remained unchanged.
Changing those would require a new response to be retrieved and stored in the chunks.
:::

### Customize the cache lifetime

The `GridDataSourceCacheDefault` has a default Time To Live (`ttl`) of 5 minutes. To customize it, pass the `ttl` option in milliseconds to the `GridDataSourceCacheDefault` constructor, and then pass it as the `dataSourceCache` prop.

```tsx
import { GridDataSourceCacheDefault } from '@mui/x-data-grid';

const lowTTLCache = new GridDataSourceCacheDefault({ ttl: 1000 * 10 }); // 10 seconds

<DataGrid
  columns={columns}
  dataSource={customDataSource}
  dataSourceCache={lowTTLCache}
/>;
```

{{"demo": "ServerSideDataGridTTL.js", "bg": "inline"}}

### Custom cache

To provide a custom cache, use `dataSourceCache` prop, which could be either written from scratch or based on another cache library.
This prop accepts a generic interface of type `GridDataSourceCache`.

```tsx
export interface GridDataSourceCache {
  set: (key: GridGetRowsParams, value: GridGetRowsResponse) => void;
  get: (key: GridGetRowsParams) => GridGetRowsResponse | undefined;
  clear: () => void;
}
```

### Disable cache

To disable the data source cache, pass `null` to the `dataSourceCache` prop.

```tsx
<DataGrid columns={columns} dataSource={customDataSource} dataSourceCache={null} />
```

{{"demo": "ServerSideDataGridNoCache.js", "bg": "inline"}}

## Updating data

The data source supports an optional `updateRow()` method for updating data on the server.

This method returns a promise that resolves when the row is updated.
If the promise resolves, the grid updates the row and mutates the cache. In case of an error, `onDataSourceError` is triggered with the error object containing the params as mentioned in the [Error handling](#error-handling) section.

```diff
 const dataSource: GridDataSource = {
  getRows: async (params: GridGetRowsParams) => {
    // fetch rows from the server
  },
+ updateRow: async (params: GridUpdateRowParams) => {
+   // update row on the server
+ },
 }
```

{{"demo": "ServerSideEditing.js", "bg": "inline"}}

:::warning
When using the `updateRow()` method, the data source cache is automatically cleared after successful updates to prevent displaying outdated data.
This means any previously cached data will be refetched on the next request.

For applications requiring caching with editing operations, consider implementing server-side caching instead.

If you have a specific use case that requires preserving the client-side cache during edit operations, please [open an issue on GitHub](https://github.com/mui/mui-x/issues/new/choose) to help us understand your requirements.
:::

:::warning
The position and visibility of the edited row on the current page are maintained—even if features like sorting or filtering are enabled—and will take affect on the row after the values update.
Any changes to the position or visibility will be applied when the page is fetched again.

You can manually trigger a refetch by calling the `dataSource.fetchRows()` API method.
:::

## Error handling

You can handle errors with the data source by providing an error handler function with `onDataSourceError()`.
This gets called whenever there's an error in fetching or updating the data.

This function recieves an error object of type `GridGetRowsError | GridUpdateRowError`.

Each error type has a corresponding `error.params` type which is passed as an argument to the callback:

| Error type           | Type of `error.params` |
| :------------------- | :--------------------- |
| `GridGetRowsError`   | `GridGetRowsParams`    |
| `GridUpdateRowError` | `GridUpdateRowParams`  |

```tsx
<DataGrid
  columns={columns}
  dataSource={customDataSource}
  onDataSourceError={(error) => {
    if (error instanceof GridGetRowsError) {
      // `error.params` is of type `GridGetRowsParams`
      // fetch related logic, e.g set an overlay state
    }
    if (error instanceof GridUpdateRowError) {
      // `error.params` is of type `GridUpdateRowParams`
      // update related logic, e.g set a snackbar state
    }
  }}
/>
```

{{"demo": "ServerSideErrorHandling.js", "bg": "inline"}}

## API

- [DataGrid](/x/api/data-grid/data-grid/)
- [DataGridPro](/x/api/data-grid/data-grid-pro/)
- [DataGridPremium](/x/api/data-grid/data-grid-premium/)
