import { DataGrid, GridRowSelectionModel } from "@mui/x-data-grid";
import { Select, MenuItem, FormControl, InputLabel, Button, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import {
  getCollectionsById,
  ICompany,
  startTransfer,
  getTransferStatus,
  ITransferStatus
} from "../utils/jam-api";
import TransferProgress from "./TransferProgress";

type CollectionMeta = { id: string; collection_name: string };

const CompanyTable = (props: { allCollections: CollectionMeta[]; selectedCollectionId: string }) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>("");
  const [allSelected, setAllSelected] = useState<boolean>(false);
  const [activeTransfers, setActiveTransfers] = useState<Map<string, ITransferStatus>>(new Map());

  useEffect(() => {
    getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
      (newResponse) => {
        setResponse(newResponse.companies);
        setTotal(newResponse.total);
      }
    );
  }, [props.selectedCollectionId, offset, pageSize]);

  useEffect(() => {
    setOffset(0);
    setAllSelected(false);
    setRowSelectionModel([]);
  }, [props.selectedCollectionId]);

  // If user clears all selections, also clear the dropdown value before disabling it
  useEffect(() => {
    if (rowSelectionModel.length === 0 && targetCollectionId !== "") {
      setTargetCollectionId("");
    }
  }, [rowSelectionModel]);

  //reload "transfer progress bars" on page reload
  useEffect(() => {
    
  })

  async function handleCompanyMove() {
    try {
      const sourceCollection = props.allCollections.find(c => c.id === props.selectedCollectionId);
      const targetCollection = props.allCollections.find(c => c.id === targetCollectionId);

      // Compute actual selected IDs based on allSelected
      let selectedIds: number[] | undefined;
      let transferAll = false;

      if (allSelected) {
        // All selected - use transfer_all
        transferAll = true;
        selectedIds = undefined;
      } else {
        selectedIds = rowSelectionModel as number[];
        transferAll = false;
      }

      const response = await startTransfer(
        props.selectedCollectionId,
        targetCollectionId,
        selectedIds,
        transferAll
      );

      // Add to active transfers map with collection names
      const initialStatus: ITransferStatus = {
        job_id: response.job_id,
        status: 'pending',
        progress: 0,
        total: response.total_companies,
        message: response.message,
        sourceCollectionName: sourceCollection?.collection_name || 'Unknown',
        targetCollectionName: targetCollection?.collection_name || 'Unknown'
      };

      setActiveTransfers(prev => {
        const newMap = new Map(prev);
        newMap.set(response.job_id, initialStatus);
        return newMap;
      });

      // Start polling for progress
      pollTransferStatus(response.job_id, sourceCollection?.collection_name || '', targetCollection?.collection_name || '');

      // Clear selections immediately
      setRowSelectionModel([]);
      setTargetCollectionId("");
      setAllSelected(false);
    } catch (error) {
      console.error('Error starting transfer:', error);
    }
  }

  function pollTransferStatus(jobId: string, sourceName: string, targetName: string) {
    let delay = 500; // Start at 500ms
    const maxDelay = 2000; // Cap at 2 seconds

    const poll = async () => {
      try {
        const status = await getTransferStatus(jobId);

        // Update the specific transfer in the map
        setActiveTransfers(prev => {
          const newMap = new Map(prev);
          const updatedStatus = {
            ...status,
            sourceCollectionName: sourceName,
            targetCollectionName: targetName,
            // Add completion timestamp when status becomes completed
            completedAt: status.status === 'completed' ? Date.now() : prev.get(jobId)?.completedAt
          };
          newMap.set(jobId, updatedStatus);
          return newMap;
        });

        if (status.status === 'in_progress' || status.status === 'pending') {
          // Exponential backoff
          delay = Math.min(delay * 1.2, maxDelay);
          setTimeout(poll, delay);
        } else {
          // Completed or failed
          onTransferComplete(jobId, status);
        }
      } catch (error) {
        console.error('Error polling transfer status:', error);
        // Remove failed polling job
        setActiveTransfers(prev => {
          const newMap = new Map(prev);
          newMap.delete(jobId);
          return newMap;
        });
      }
    };

    poll();
  }

  function onTransferComplete(jobId: string, status: ITransferStatus) {
    if (status.status === 'completed') {
      // Refresh current collection
      getCollectionsById(props.selectedCollectionId, offset, pageSize).then(
        (newResponse) => {
          setResponse(newResponse.companies);
          setTotal(newResponse.total);
        }
      );

      // Auto-remove completed transfer after 7 seconds
      setTimeout(() => {
        setActiveTransfers(prev => {
          const newMap = new Map(prev);
          newMap.delete(jobId);
          return newMap;
        });
      }, 7000);
    }
  }

  // Handle when user clicks "Select all X in collection" or "Clear selection"
  function handleSelectAllInCollection() {
    if (allSelected) {
      // Clear all selections
      setAllSelected(false);
      setRowSelectionModel([]);
    } else {
      // Select all in collection
      setAllSelected(true);
      // Set current page items as selected in the model
      setRowSelectionModel(response.map(r => r.id));
    }
  }

  return (
    <div>
      <div style={{ 
          marginBottom: "24px", 
          display: "flex", 
          justifyContent: "flex-end",
          alignItems: "center"
        }}>
        <div style={{
          paddingRight: "10px"
        }}>
          <FormControl 
            style={{
              minWidth: "200px",
              maxWidth: "350px",
            }} 
            size="small"
            disabled={!allSelected && rowSelectionModel.length === 0}
          >
            <InputLabel id="move-items-to-collection">Move Companies To...</InputLabel>
            <Select
              labelId="move-items-to-collection"
              value={targetCollectionId}
              onChange={(e) => setTargetCollectionId(e.target.value as string)}
            >
              {props.allCollections
                .filter((c) => c.id !== props.selectedCollectionId)
                .map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.collection_name}</MenuItem>
                ))}
            </Select>
          </FormControl>
        </div>
        <div>
          <Button
            style={{
              background: "blue",
              height: 40
            }}
            size="small"
            variant="contained"
            onClick={handleCompanyMove}
            disabled={(!allSelected && rowSelectionModel.length === 0) || !targetCollectionId}
          >
            Move
          </Button>
        </div>
      </div>
      {/* Gmail-style selection banner */}
      {(rowSelectionModel.length === response.length && response.length > 0 && !allSelected) && (
        <div style={{
          marginBottom: "8px",
          padding: "8px 16px",
          backgroundColor: "black",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <Typography variant="body2" style={{ color: "white" }}>
            All {response.length} items on this page are selected.{" "}
            <Button
              variant="text"
              size="small"
              onClick={handleSelectAllInCollection}
              style={{ textTransform: "none", padding: "0 4px" }}
            >
              Select all {total} items in collection
            </Button>
          </Typography>
        </div>
      )}
      {allSelected && (
        <div style={{
          marginBottom: "8px",
          padding: "8px 16px",
          backgroundColor: "black",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
          <Typography variant="body2" style={{ color: "white" }}>
            All {total} items are selected.{" "}
            <Button
              variant="text"
              size="small"
              onClick={handleSelectAllInCollection}
              style={{ textTransform: "none", padding: "0 4px" }}
            >
              Clear selection
            </Button>
          </Typography>
        </div>
      )}
      <div style={{ 
        height: 600, 
        width: "100%",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        borderRadius: "8px",
        overflow: "hidden"
      }}>
        <DataGrid
          rows={response}
          rowHeight={30}
          columns={[
            { 
              field: "liked", 
              headerName: "Liked", 
              width: 90,
              renderCell: (params) => (
                <span style={{ 
                  color: params.value === true ? 'green' : 'inherit',
                }}>
                  {params.value ? 'true' : 'false'}
                </span>
              )
            },
            { field: "id", headerName: "ID", width: 90 },
            { field: "company_name", headerName: "Company Name", width: 200 },
          ]}
          initialState={{
            pagination: {
              paginationModel: { page: 0, pageSize: 25 },
            },
          }}
          rowCount={total}
          pagination
          checkboxSelection
          paginationMode="server"
          rowSelectionModel={
            allSelected
              ? response.map(r => r.id)
              : rowSelectionModel
          }
          onRowSelectionModelChange={(newModel) => {
            if (allSelected) {
              // When all selected, any change means user is deselecting all
              // Clear allSelected and update to the new selection
              setAllSelected(false);
              setRowSelectionModel(newModel);
            } else {
              setRowSelectionModel(newModel);
            }
          }}
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
          }}
        />
      </div>
      {(() => {
        // Sort transfers: completed first (sorted by completedAt), then in-progress
        const sortedTransfers = Array.from(activeTransfers.entries()).sort(([, a], [, b]) => {
          // Completed transfers come first
          if (a.status === 'completed' && b.status !== 'completed') return -1;
          if (a.status !== 'completed' && b.status === 'completed') return 1;

          // Among completed transfers, sort by completion time (earliest first)
          if (a.status === 'completed' && b.status === 'completed') {
            return (a.completedAt || 0) - (b.completedAt || 0);
          }

          // Keep original order for non-completed transfers
          return 0;
        });

        const totalTransfers = sortedTransfers.length;
        return sortedTransfers.map(([jobId, status], index) => (
        <TransferProgress
          key={jobId}
          status={status}
          index={totalTransfers - 1 - index}
          onClose={() => {
            setActiveTransfers(prev => {
              const newMap = new Map(prev);
              newMap.delete(jobId);
              return newMap;
            });
          }}
          onRetry={() => {
            const transfer = activeTransfers.get(jobId);
            if (transfer) {
              pollTransferStatus(
                jobId,
                transfer.sourceCollectionName || '',
                transfer.targetCollectionName || ''
              );
            }
          }}
        />
        ));
      })()}
    </div>
  );
};

export default CompanyTable;
