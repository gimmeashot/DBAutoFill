export default {
  schema: "public",
  defaultRows: 10,
  tables: {
    users: {
      rows: 5,
      columns: {
        status: { values: ["active", "blocked"] }
      }
    },
    orders: {
      rows: 20
    },
    audit_log: {
      skip: true
    }
  }
};
