-- 辅导员审核评分：1-5 星，仅审核通过时填写
ALTER TABLE progress ADD COLUMN score INTEGER CHECK (score BETWEEN 1 AND 5);
