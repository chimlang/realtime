const obstacles = new Set([31,39,131,138,139,231,232,238,332,333,338,433,434,435,436,437,438,683,684,685,686,687,690,691,692,693,694,783,794,823,883,894,922,923,924,983,994,1022,1024,1025,1083,1094,1122,1123,1124,1125,1207,1208,1209,1210,1211,1214,1215,1216,1217,1218,1223,1224,1307,1318,1331,1383,1394,1407,1418,1431,1483,1494,1507,1518,1531,1532,1539,1583,1594,1607,1618,1632,1639,1683,1694,1732,1733,1738,1739,1783,1784,1785,1786,1787,1790,1791,1792,1793,1794,1833,1838,1907,1918,1933,1934,1937,1938,2007,2018,2034,2036,2037,2107,2118,2134,2135,2136,2200,2201,2207,2218,2235,2236,2237,2301,2307,2308,2309,2310,2311,2314,2315,2316,2317,2318,2336,2337,2338,2401,2402,2437,2438,2439,2440,2476,2477,2478,2479,2480,2481,2482,2483,2484,2485,2486,2489,2490,2500,2501,2502,2538,2539,2540,2541,2542,2573,2574,2575,2576,2586,2589,2590,2591,2592,2593,2639,2640,2641,2642,2643,2644,2645,2670,2671,2672,2673,2686,2689,2693,2694,2742,2743,2744,2745,2746,2747,2748,2749,2750,2751,2752,2753,2754,2755,2756,2757,2758,2759,2760,2763,2764,2765,2766,2767,2768,2769,2770,2786,2789,2794,2795,2844,2845,2846,2847,2848,2849,2860,2863,2886,2889,2895,2898,2949,2950,2951,2960,2963,2976,2977,2978,2979,2980,2981,2982,2983,2984,2985,2986,2989,2995,2998,2999,3051,3052,3053,3054,3055,3056,3057,3058,3059,3060,3063,3064,3065,3066,3067,3068,3069,3070,3071,3072,3073,3074,3075,3076,3089,3090,3095,3098,3099,3142,3173,3176,3190,3191,3192,3195,3198,3242,3273,3276,3292,3293,3295,3298,3342,3373,3376,3393,3394,3395,3398,3442,3473,3474,3475,3476,3495,3498,3542,3552,3553,3554,3555,3556,3557,3558,3561,3562,3563,3564,3565,3566,3567,3575,3576,3595,3598,3642,3652,3667,3676,3698,3742,3752,3767,3776,3798,3817,3818,3819,3820,3821,3822,3823,3826,3827,3828,3829,3830,3831,3832,3842,3852,3867,3876,3898,3899,3917,3932,3949,3952,3967,3970,4017,4032,4049,4070,4117,4123,4124,4125,4126,4132,4149,4170,4217,4232,4249,4252,4267,4270,4276,4317,4332,4342,4352,4367,4376,4417,4420,4429,4432,4442,4452,4467,4476,4520,4529,4542,4552,4567,4576,4620,4629,4642,4652,4653,4654,4655,4656,4657,4658,4661,4662,4663,4664,4665,4666,4667,4676,4717,4720,4729,4732,4742,4776,4817,4832,4842,4876,4917,4932,4942,4958,4959,4960,4961,4962,4963,4964,4965,4966,4967,4975,4976,4977,5017,5023,5024,5025,5026,5032,5042,5043,5044,5045,5046,5047,5048,5049,5050,5051,5053,5054,5055,5056,5057,5058,5067,5068,5069,5070,5071,5073,5074,5075,5077,5078,5079,5080,5117,5132,5141,5142,5171,5172,5173,5180,5217,5232,5241,5280,5317,5318,5319,5320,5321,5322,5323,5326,5327,5328,5329,5330,5331,5332,5341,5380,5441,5480,5516,5517,5541,5578,5579,5580,5610,5611,5612,5613,5614,5615,5616,5617,5618,5641,5673,5674,5675,5676,5677,5678,5710,5718,5719,5720,5741,5771,5772,5773,5809,5810,5820,5841,5842,5843,5844,5845,5846,5863,5864,5865,5867,5868,5869,5870,5871,5909,5920,5924,5925,5926,5927,5928,5929,5930,5931,5946,5947,5948,5949,5950,5961,5962,5963,6008,6009,6020,6021,6024,6031,6032,6050,6051,6052,6053,6054,6055,6058,6059,6060,6061,6108,6121,6124,6132,6133,6155,6156,6157,6158,6208,6220,6221,6223,6224,6233,6234,6235,6236,6237,6308,6319,6320,6323,6337,6408,6418,6419,6422,6423,6437,6438,6508,6509,6517,6518,6522,6538,6609,6610,6611,6612,6613,6616,6617,6622,6638,6639,6640,6713,6714,6715,6716,6722,6723,6740,6823,6824,6840,6851,6852,6853,6861,6862,6863,6864,6924,6925,6926,6940,6948,6949,6950,6951,6964,6965,6966,7008,7009,7014,7015,7016,7026,7027,7028,7029,7039,7040,7046,7047,7048,7066,7067,7081,7082,7083,7084,7085,7088,7089,7090,7091,7092,7106,7107,7108,7116,7117,7121,7122,7129,7130,7138,7139,7145,7146,7152,7153,7158,7159,7167,7181,7192,7204,7206,7222,7223,7230,7231,7232,7233,7234,7235,7236,7237,7238,7244,7245,7250,7251,7252,7259,7260,7261,7267,7268,7281,7292,7303,7304,7323,7344,7349,7350,7361,7362,7368,7381,7392,7402,7403,7423,7443,7444,7448,7449,7462,7463,7481,7492,7501,7502,7508,7509,7510,7511,7512,7515,7516,7517,7518,7519,7523,7524,7543,7548,7551,7552,7553,7554,7557,7558,7559,7560,7563,7564,7601,7608,7619,7624,7647,7648,7651,7660,7664,7665,7701,7708,7719,7747,7751,7760,7765,7781,7792,7801,7802,7808,7819,7843,7851,7860,7881,7892,7902,7908,7919,7942,7943,7968,7969,7981,7992,8024,8025,8042,8069,8081,8092,8125,8151,8160,8169,8181,8182,8183,8184,8185,8188,8189,8190,8191,8192,8208,8219,8251,8260,8308,8319,8347,8351,8360,8364,8365,8408,8419,8442,8447,8448,8452,8453,8454,8457,8458,8459,8460,8463,8464,8469,8508,8519,8525,8542,8543,8548,8549,8562,8563,8568,8569,8602,8608,8609,8610,8611,8612,8615,8616,8617,8618,8619,8624,8625,8643,8649,8650,8651,8659,8660,8661,8662,8668,8702,8703,8724,8743,8751,8752,8753,8754,8756,8757,8758,8759,8767,8768,8803,8823,8824,8843,8844,8854,8855,8856,8866,8867,8903,8904,8923,8944,8945,8964,8965,8966,8999,9004,9005,9006,9022,9023,9045,9046,9047,9048,9061,9062,9063,9064,9098,9099,9106,9107,9108,9109,9120,9121,9122,9148,9149,9150,9151,9158,9159,9160,9161,9197,9198,9209,9210,9217,9218,9219,9220,9251,9252,9253,9254,9255,9256,9257,9258,9267,9268,9269,9270,9271,9272,9273,9296,9297,9310,9311,9312,9316,9317,9362,9363,9364,9365,9366,9367,9373,9374,9375,9376,9393,9394,9395,9396,9412,9413,9414,9415,9416,9458,9459,9460,9461,9462,9476,9477,9478,9479,9491,9492,9493,9552,9553,9554,9555,9556,9557,9558,9559,9560,9561,9562,9579,9580,9581,9589,9590,9591,9648,9649,9650,9651,9652,9653,9654,9655,9656,9657,9658,9681,9682,9683,9684,9685,9686,9687,9688,9689,9746,9747,9748,9749,9750,9843,9844,9845,9846,9847,9941,9942,9943])

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = obstacles;
}