import { DataGrid, GridRowSelectionModel } from "@mui/x-data-grid";
import { Select, MenuItem, FormControl, InputLabel, Button } from "@mui/material";
import { useEffect, useState } from "react";
import { getCollectionsById, ICompany, moveSelectedCompaniesToCollection } from "../utils/jam-api";

type CollectionMeta = { id: string; collection_name: string };

const CompanyTable = (props: { allCollections: CollectionMeta[]; selectedCollectionId: string }) => {
  const [response, setResponse] = useState<ICompany[]>([]);
  const [total, setTotal] = useState<number>();
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState(25);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>([]);
  const [targetCollectionId, setTargetCollectionId] = useState<string>("");

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
  }, [props.selectedCollectionId]);

  // If user clears all selections, also clear the dropdown value before disabling it
  useEffect(() => {
    if (rowSelectionModel.length === 0 && targetCollectionId !== "") {
      setTargetCollectionId("");
    }
  }, [rowSelectionModel]);

  // OPTIONAL: Reset dropdown when switching collections
  // useEffect(() => {
  //   setRowSelectionModel([]);
  //   setTargetCollectionId("");
  // }, [props.selectedCollectionId]);

  async function handleCompanyMove() {
    try {
      const companyIds = rowSelectionModel as number[];
      await moveSelectedCompaniesToCollection(companyIds, targetCollectionId);
      
      // Clear selections
      setRowSelectionModel([]);
      setTargetCollectionId("");
    } catch (error) {
      console.error('Error moving companies:', error);
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
            disabled={rowSelectionModel.length === 0}
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
              background: "blue"
            }}
            onClick={handleCompanyMove}
            disabled={rowSelectionModel.length === 0 || !targetCollectionId}
          >
            Move
          </Button>
        </div>
      </div>
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
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={(newModel) => setRowSelectionModel(newModel)}
          onPaginationModelChange={(newMeta) => {
            setPageSize(newMeta.pageSize);
            setOffset(newMeta.page * newMeta.pageSize);
          }}
        />
      </div>
    </div>
  );
};

export default CompanyTable;
