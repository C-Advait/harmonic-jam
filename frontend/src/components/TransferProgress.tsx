import React from 'react';
import { Snackbar, LinearProgress, IconButton, Alert, Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ITransferStatus } from '../utils/jam-api';

interface TransferProgressProps {
  status: ITransferStatus | null;
  onClose: () => void;
  onRetry?: () => void;
  index?: number;  // For stacking position
}

const TransferProgress: React.FC<TransferProgressProps> = ({ status, onClose, onRetry, index = 0 }) => {
  if (!status) return null;

  const progress = status.total > 0 ? (status.progress / status.total) * 100 : 0;
  const isCompleted = status.status === 'completed';
  const isFailed = status.status === 'failed';

  // Auto-close after 7 seconds if completed
  React.useEffect(() => {
    if (isCompleted) {
      const timer = setTimeout(onClose, 7000);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, onClose]);

  return (
    <Snackbar
      open={!!status}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        width: '500px',
        bottom: `${index * 80 + 24}px !important`  // Stack with 80px spacing
      }}
    >
      <Alert
        severity={isFailed ? 'error' : isCompleted ? 'success' : 'info'}
        action={
          <IconButton
            size="small"
            aria-label="close"
            color="inherit"
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
        sx={{ width: '100%' }}
      >
        <Box>
          <Typography variant="body2" gutterBottom>
            {status.sourceCollectionName && status.targetCollectionName ? (
              <>Moving from "{status.sourceCollectionName}" to "{status.targetCollectionName}"</>
            ) : (
              status.message
            )}
          </Typography>

          {status.status === 'in_progress' && (
            <>
              <Typography variant="caption" display="block" gutterBottom>
                Moving companies: {status.progress}/{status.total} ({Math.round(progress)}%)
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ mt: 1, mb: 1 }}
              />
            </>
          )}

          {isFailed && onRetry && (
            <Box mt={1}>
              <Typography
                variant="caption"
                sx={{
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  '&:hover': { color: 'primary.main' }
                }}
                onClick={onRetry}
              >
                Click to retry
              </Typography>
            </Box>
          )}
        </Box>
      </Alert>
    </Snackbar>
  );
};

export default TransferProgress;