'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';
import { tripsApi } from '@/lib/pocketbase';
import type { Trip } from '@/lib/types';
import { LoadingSpinner } from '@/components/layout/LoadingScreen';
import { AdminView } from './_components/AdminView';
import { MemberView } from './_components/MemberView';

export default function TripPage({ params }: { params: Promise<{ groupId: string; tripId: string }> }) {
    const { tripId } = use(params);
    const { user, isLoggedIn } = useUser();
    const router = useRouter();

    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAccess = async () => {
            if (!isLoggedIn) {
                router.push('/');
                return;
            }

            try {
                const data = await tripsApi.getById(tripId);
                setTrip(data);
            } catch (error) {
                console.error('Error loading trip:', error);
                router.push('/dashboard');
            } finally {
                setLoading(false);
            }
        };

        checkAccess();
    }, [tripId, isLoggedIn, router]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-[var(--bg-secondary)]">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!trip) return null;

    // Check ownership
    // Assuming created_by is the user ID correctly populated
    const isOwner = user?.id === trip.created_by;

    if (isOwner) {
        return <AdminView tripId={tripId} />;
    }

    return <MemberView tripId={tripId} />;
}
