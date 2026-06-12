-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "results_match" BOOLEAN;

-- AlterTable
ALTER TABLE "ranking_history" ADD COLUMN     "old_position" INTEGER;
