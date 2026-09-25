import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { authApi, globalApi, setAccessToken } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { buildQuotaRows, toggleQuotaRootId } from '../components/modals/settingsModalUtils';

export function useAccountSettings(activeTab) {
    const { user, setUser, signOutEverywhere } = useAuth();
    const [accountUsage, setAccountUsage] = useState(null);
    const [accountUsageLoading, setAccountUsageLoading] = useState(false);
    const [availableFractals, setAvailableFractals] = useState([]);
    const [fractalsLoading, setFractalsLoading] = useState(false);
    const [selectedQuotaRootIds, setSelectedQuotaRootIds] = useState([]);

    const [passwordData, setPasswordData] = useState({ current_password: '', new_password: '' });
    const [emailData, setEmailData] = useState({ email: '', password: '' });
    const [deleteData, setDeleteData] = useState({ password: '', confirmation: '' });
    const [exportPassword, setExportPassword] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (activeTab !== 'account') return;

        let cancelled = false;
        setAccountUsageLoading(true);
        const params = selectedQuotaRootIds.length > 0
            ? { root_ids: selectedQuotaRootIds.join(',') }
            : {};
        authApi.getAccountUsage(params)
            .then((res) => {
                if (!cancelled) {
                    setAccountUsage(res.data);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    notify.error(`Failed to load account usage: ${formatError(err)}`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setAccountUsageLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab, selectedQuotaRootIds]);

    useEffect(() => {
        if (activeTab !== 'account') return;

        let cancelled = false;
        setFractalsLoading(true);
        globalApi.getAllFractals()
            .then((res) => {
                if (!cancelled) {
                    const fractals = Array.isArray(res.data) ? res.data : [];
                    setAvailableFractals(fractals);
                    const availableIds = new Set(fractals.map((fractal) => fractal.id));
                    setSelectedQuotaRootIds((current) => current.filter((rootId) => availableIds.has(rootId)));
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    notify.error(`Failed to load fractals: ${formatError(err)}`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setFractalsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    const quotaRows = useMemo(() => buildQuotaRows(accountUsage), [accountUsage]);

    const displayTier = accountUsage?.tier || user?.membership_tier || 'free';
    const displayStatus = accountUsage?.subscription_status || user?.subscription_status || 'none';
    const quotaScopeLabel = selectedQuotaRootIds.length === 0
        ? 'All fractals'
        : `${selectedQuotaRootIds.length} selected`;

    const handleQuotaRootToggle = (rootId) => {
        setSelectedQuotaRootIds((current) => toggleQuotaRootId(current, rootId));
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        try {
            const res = await authApi.updatePassword(passwordData);
            // The change signed out every other device; this one continues on its replacement token.
            if (res.data?.token) setAccessToken(res.data.token);
            notify.success('Password updated. Other devices have been signed out.');
            setPasswordData({ current_password: '', new_password: '' });
        } catch (err) {
            notify.error(`Failed to update password: ${formatError(err)}`);
        }
    };

    const handleEmailUpdate = async (e) => {
        e.preventDefault();
        try {
            await authApi.updateEmail(emailData);
            notify.success('Email updated successfully');
            setEmailData({ email: '', password: '' });
        } catch (err) {
            notify.error(`Failed to update email: ${formatError(err)}`);
        }
    };

    const handleExportData = async (e) => {
        e.preventDefault();
        setIsExporting(true);
        try {
            const res = await authApi.exportAccountData({ password: exportPassword });
            // Turn the JSON response into a file download without a round trip.
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fractal-goals-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setExportPassword('');
            notify.success('Your data export has been downloaded.');
        } catch (err) {
            notify.error(`Failed to export data: ${formatError(err)}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDeleteAccount = async (e) => {
        e.preventDefault();
        if (deleteData.confirmation !== 'DELETE') return;

        const confirmed = window.confirm(
            'Your account will remain accessible and be permanently deleted in 30 days.\n\n'
            + 'You can cancel any time during those 30 days from Account Settings. '
            + 'After that, deletion is irreversible.\n\n'
            + 'Have you downloaded your data?'
        );
        if (confirmed) {
            try {
                const res = await authApi.deleteAccount(deleteData);
                notify.success(res?.data?.message || 'Account deletion scheduled.');
                const currentUser = await authApi.getMe();
                setUser(currentUser.data);
            } catch (err) {
                notify.error(`Failed to delete account: ${formatError(err)}`);
            }
        }
    };

    const handleSignOutEverywhere = async () => {
        const confirmed = window.confirm(
            'Sign out of all devices?\n\nEvery session, including this one, will end and you will need to log in again.'
        );
        if (!confirmed) return;
        try {
            await signOutEverywhere();
        } catch (err) {
            notify.error(`Failed to sign out of all devices: ${formatError(err)}`);
        }
    };

    const handleCancelDeletion = async () => {
        try {
            await authApi.cancelAccountDeletion();
            const currentUser = await authApi.getMe();
            setUser(currentUser.data);
            notify.success('Account deletion cancelled.');
        } catch (err) {
            notify.error(`Failed to cancel account deletion: ${formatError(err)}`);
        }
    };

    return { user, accountUsage, accountUsageLoading, availableFractals, fractalsLoading, selectedQuotaRootIds, setSelectedQuotaRootIds, passwordData, setPasswordData, emailData, setEmailData, deleteData, setDeleteData, exportPassword, setExportPassword, isExporting, quotaRows, displayTier, displayStatus, quotaScopeLabel, handleQuotaRootToggle, handlePasswordUpdate, handleEmailUpdate, handleExportData, handleDeleteAccount, handleCancelDeletion, handleSignOutEverywhere };
}
