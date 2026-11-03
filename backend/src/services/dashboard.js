var DashboardService = {
  get: function (payload) {
    var motorId = requireId_(payload, 'motorId');
    var motor = MotorService.getOrThrow(motorId);
    var records = Db.all(SHEETS.RECORDS).filter(function (r) { return r.motorId === motorId; });
    var today = todayISO_();

    return {
      motor: motor,
      lastRecord: RecordService.latest(motorId),
      reminders: ReminderService.computeForMotor(motor).filter(function (r) { return r.status !== 'NONAKTIF'; }),
      spend: {
        thisMonth: Logic.sumByDatePrefix(records, today.substring(0, 7)),
        thisYear: Logic.sumByDatePrefix(records, today.substring(0, 4)),
      },
      recordCount: records.length,
      today: today,
    };
  },
};
